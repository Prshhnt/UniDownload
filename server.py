"""
Flask API Server for UniDownload
Provides REST API endpoints for downloading media from various platforms
"""


from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flasgger import Swagger, swag_from
import logging
import os
import re
from youtube import YouTubeDownloader
from instagram import InstagramDownloader
from facebook import FacebookDownloader

# Celery setup
from celery import Celery

def make_celery(app):
    celery = Celery(
        app.import_name,
        backend=os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
        broker=os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
    )
    celery.conf.update(app.config)
    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)
    celery.Task = ContextTask
    return celery


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.environ.get('CORS_ORIGINS', '*')}})
Swagger(app)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s'
)
logger = logging.getLogger(__name__)

# Celery instance
celery = make_celery(app)

# Initialize downloaders
youtube_dl = YouTubeDownloader()
instagram_dl = InstagramDownloader()
facebook_dl = FacebookDownloader()


def detect_platform(url):
    """Detect platform from URL"""
    url = url.lower()
    
    if 'youtube.com' in url or 'youtu.be' in url:
        return 'youtube'
    elif 'instagram.com' in url:
        return 'instagram'
    elif 'facebook.com' in url or 'fb.watch' in url:
        return 'facebook'
    else:
        return 'unknown'


@app.route('/api/detect', methods=['POST'])
@swag_from({
    'tags': ['Detection'],
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'url': {'type': 'string', 'example': 'https://youtube.com/watch?v=...'}
                },
                'required': ['url']
            }
        }
    ],
    'responses': {
        200: {
            'description': 'Media info',
            'examples': {
                'application/json': {
                    'platform': 'youtube',
                    'title': 'Video Title',
                    'uploader': 'Channel Name',
                    'duration': 180,
                    'thumbnail': 'https://...',
                    'formats': [],
                    'options': []
                }
            }
        },
        400: {'description': 'Invalid input'},
        500: {'description': 'Server error'}
    }
})
def detect():
    """Detect platform and get media info"""
    try:
        data = request.json
        url = data.get('url', '')
        
        if not url:
            logger.warning('No URL provided to /api/detect')
            return jsonify({'error': 'URL is required'}), 400
        
        platform = detect_platform(url)
        
        if platform == 'unknown':
            logger.warning(f'Unsupported platform for url: {url}')
            return jsonify({'error': 'Unsupported platform'}), 400
        
        # Get media info based on platform
        try:
            if platform == 'youtube':
                info = youtube_dl.get_video_info(url)
                if not info:
                    logger.error('Failed to fetch YouTube video information')
                    return jsonify({'error': 'Failed to fetch video information'}), 400
                formats = youtube_dl.display_formats(info, return_formats=True)
                formatted_formats = [
                    {'format_id': f['height'], 'label': f['display']} for f in formats
                ]
                response = {
                    'platform': 'youtube',
                    'title': info.get('title', 'Unknown'),
                    'uploader': info.get('uploader', 'Unknown'),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'formats': formatted_formats,
                    'has_subtitles': bool(info.get('subtitles')),
                    'options': ['video', 'audio', 'playlist', 'subtitles', 'thumbnail']
                }
            elif platform == 'instagram':
                info = instagram_dl.get_media_info(url)
                if not info:
                    logger.error('Failed to fetch Instagram media information')
                    return jsonify({'error': 'Failed to fetch media information'}), 400
                media_type = instagram_dl.detect_media_type(url)
                response = {
                    'platform': 'instagram',
                    'title': info.get('title', 'Unknown'),
                    'uploader': info.get('uploader', 'Unknown'),
                    'thumbnail': info.get('thumbnail', ''),
                    'media_type': media_type,
                    'options': ['post', 'audio']
                }
            elif platform == 'facebook':
                info = facebook_dl.get_video_info(url)
                if not info:
                    logger.error('Failed to fetch Facebook content information')
                    return jsonify({'error': 'Failed to fetch content information'}), 400
                content_type = facebook_dl.detect_content_type(url)
                response = {
                    'platform': 'facebook',
                    'title': info.get('title', 'Unknown'),
                    'uploader': info.get('uploader', 'Unknown'),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'content_type': content_type,
                    'options': ['post', 'audio']
                }
            else:
                logger.error(f'Unknown platform: {platform}')
                return jsonify({'error': 'Unknown platform'}), 400
            logger.info(f"/api/detect success for {platform} - {url}")
            return jsonify(response)
        except Exception as e:
            logger.exception(f"Error in /api/detect: {str(e)}")
            return jsonify({'error': str(e)}), 500
        
    except Exception as e:
        print(f"Server error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/download', methods=['POST'])
@swag_from({
    'tags': ['Download'],
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'url': {'type': 'string'},
                    'platform': {'type': 'string'},
                    'option': {'type': 'string'},
                    'format_id': {'type': 'string'}
                },
                'required': ['url', 'platform', 'option']
            }
        }
    ],
    'responses': {
        200: {'description': 'Download started'},
        400: {'description': 'Invalid input'},
        500: {'description': 'Server error'}
    }
})
def download():
    """Download media with specified options"""

    try:
        data = request.json
        url = data.get('url', '')
        platform = data.get('platform', '')
        option = data.get('option', '')
        format_id = data.get('format_id', None)
        if not url or not platform:
            logger.warning('Missing url or platform in /api/download')
            return jsonify({'error': 'URL and platform are required'}), 400
        # Async download task
        task = async_download.apply_async(args=[platform, url, option, format_id])
        logger.info(f"Download task queued: {task.id} for {platform} - {url}")
        return jsonify({'success': True, 'message': 'Download started', 'task_id': task.id})
    except Exception as e:
        logger.exception(f"Error in /api/download: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Celery async download task
@celery.task()
def async_download(platform, url, option, format_id):
    try:
        if platform == 'youtube':
            if option == 'audio':
                youtube_dl.download_audio(url)
            elif option == 'subtitles':
                youtube_dl.download_subtitles_only(url)
            elif option == 'thumbnail':
                youtube_dl.download_thumbnail(url)
            elif option == 'playlist':
                youtube_dl.download_playlist(url)
            else:
                if format_id:
                    youtube_dl.download_video(url, quality_height=int(format_id))
                else:
                    youtube_dl.download_video(url)
        elif platform == 'instagram':
            if option == 'audio':
                instagram_dl.download_audio(url)
            else:
                instagram_dl.download_post(url)
        elif platform == 'facebook':
            if option == 'audio':
                facebook_dl.download_audio(url)
            else:
                facebook_dl.download_post(url)
        logger.info(f"Download completed for {platform} - {url}")
        return {'status': 'completed'}
    except Exception as e:
        logger.exception(f"Download failed for {platform} - {url}: {str(e)}")
        return {'status': 'failed', 'error': str(e)}



@app.route('/api/health', methods=['GET'])
@swag_from({
    'tags': ['Health'],
    'responses': {
        200: {'description': 'API is healthy'}
    }
})
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'UniDownload API is running'})



## Removed static file serving. Backend now only exposes API endpoints.



if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Starting UniDownload API Server on port {port}")
    logger.info("API docs available at /apidocs")
    debug_mode = os.environ.get('FLASK_ENV') != 'production'
    app.run(debug=debug_mode, host='0.0.0.0', port=port)
