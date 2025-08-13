#!/usr/bin/env python3
"""
Development Flask server for testing satellite image processing frontend.

This server accepts satellite images via POST request and returns them back
for testing purposes. In a real implementation, you would process the image
and return a generated video.

Usage:
    python dev_server.py

Requirements:
    pip install flask flask-cors pillow

Environment Variables:
    AUTHORIZATION_TOKEN: Secret token for API authentication (default: 'dev_token_123')
    PORT: Port to run server on (default: 3000)
"""

import os
import base64
import tempfile
import uuid
from io import BytesIO
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import logging
import cv2
import numpy as np
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
AUTHORIZATION_TOKEN = os.getenv('AUTHORIZATION_TOKEN', 'dev_token_123')
PORT = int(os.getenv('PORT', 3000))

def validate_authorization(request):
    """Validate the authorization token from request headers."""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return False, 'Missing Authorization header'
    
    if not auth_header.startswith('Bearer '):
        return False, 'Invalid Authorization header format'
    
    token = auth_header.replace('Bearer ', '')
    if token != AUTHORIZATION_TOKEN:
        return False, 'Invalid authorization token'
    
    return True, 'Valid'

def create_video_from_image(image_path, output_path, duration=5, fps=30):
    """Create a 5-second video from a static image."""
    try:
        # Read the image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image file")
        
        # Get image dimensions
        height, width, layers = img.shape
        logger.info(f"Original image dimensions: {width}x{height}")
        
        # Resize to 512x512 to match display size
        img = cv2.resize(img, (512, 512))
        height, width = 512, 512
        logger.info(f"Resized image to: {width}x{height}")
        
        # Try different codecs for better web compatibility
        # H.264 is most web-compatible
        codecs_to_try = [
            ('H264', '.mp4'),
            ('mp4v', '.mp4'),
            ('XVID', '.avi'), 
            ('MJPG', '.avi')
        ]
        
        success = False
        for codec_name, ext in codecs_to_try:
            try:
                # Adjust output path extension if needed
                current_output = output_path
                if not output_path.endswith(ext):
                    current_output = output_path.rsplit('.', 1)[0] + ext
                
                logger.info(f"Trying codec: {codec_name}, output: {current_output}")
                
                # Define the codec and create VideoWriter object
                fourcc = cv2.VideoWriter_fourcc(*codec_name)
                out = cv2.VideoWriter(current_output, fourcc, fps, (width, height))
                
                if not out.isOpened():
                    logger.warning(f"Failed to open VideoWriter with codec {codec_name}")
                    continue
                
                # Calculate total frames needed
                total_frames = duration * fps
                logger.info(f"Writing {total_frames} frames...")
                
                # Write the same frame multiple times
                for i in range(total_frames):
                    ret = out.write(img)
                    if not ret:
                        logger.warning(f"Failed to write frame {i}")
                
                # Release everything
                out.release()
                
                # Check if file was created and has content
                if os.path.exists(current_output) and os.path.getsize(current_output) > 0:
                    logger.info(f"Successfully created video: {current_output} ({duration}s, {fps}fps, {total_frames} frames, size: {os.path.getsize(current_output)} bytes)")
                    # Copy to original output path if different
                    if current_output != output_path:
                        import shutil
                        shutil.copy2(current_output, output_path)
                        os.remove(current_output)
                    success = True
                    break
                else:
                    logger.warning(f"Video file not created or empty with codec {codec_name}")
                    
            except Exception as codec_error:
                logger.warning(f"Codec {codec_name} failed: {str(codec_error)}")
                continue
        
        cv2.destroyAllWindows()
        
        if not success:
            logger.error("All codecs failed to create video")
            return False
            
        return True
        
    except Exception as e:
        logger.error(f"Error creating video: {str(e)}")
        return False

@app.route('/api/process-image', methods=['POST'])
def process_image():
    """Process satellite image and return a test response."""
    try:
        # Validate authorization
        is_valid, message = validate_authorization(request)
        if not is_valid:
            logger.warning(f"Unauthorized request: {message}")
            return jsonify({'error': message}), 401
        
        # Get form data
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        image_file = request.files['image']
        latitude = request.form.get('latitude')
        longitude = request.form.get('longitude')
        session_id = request.form.get('session_id')
        
        logger.info(f"Received request - Session: {session_id}, Lat: {latitude}, Lng: {longitude}")
        
        # Validate required fields
        if not all([latitude, longitude, session_id]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Process the image (validate it's a valid image)
        try:
            image = Image.open(image_file.stream)
            logger.info(f"Received image: {image.format}, Size: {image.size}")
        except Exception as e:
            logger.error(f"Invalid image file: {str(e)}")
            return jsonify({'error': 'Invalid image file'}), 400
        
        # Reset stream position and save image temporarily
        image_file.stream.seek(0)
        
        # Create temporary files for image and video
        temp_dir = tempfile.gettempdir()
        unique_id = str(uuid.uuid4())
        temp_image_path = os.path.join(temp_dir, f"satellite_{unique_id}.png")
        temp_video_path = os.path.join(temp_dir, f"satellite_{unique_id}.mp4")
        
        try:
            # Save the uploaded image temporarily
            with open(temp_image_path, 'wb') as f:
                f.write(image_file.stream.read())
            
            logger.info(f"Saved temp image: {temp_image_path}")
            
            # Simulate some processing time
            import time
            time.sleep(1)  # 1 second delay to simulate processing
            
            # Create 5-second video from the image
            logger.info("Creating video from image...")
            if create_video_from_image(temp_image_path, temp_video_path, duration=5, fps=30):
                # Video created successfully
                video_url = f"/video/{unique_id}"
                logger.info(f"Video created successfully: {video_url}")
            else:
                raise Exception("Failed to create video from image")
                
        except Exception as e:
            # Clean up temp files on error
            if os.path.exists(temp_image_path):
                os.remove(temp_image_path)
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            raise e
        finally:
            # Always clean up the temp image
            if os.path.exists(temp_image_path):
                os.remove(temp_image_path)
        
        response_data = {
            'video_url': f"http://localhost:{PORT}{video_url}",  # Return full URL to video
            'status': 'success',
            'session_id': session_id,
            'coordinates': {
                'latitude': float(latitude),
                'longitude': float(longitude)
            },
            'message': 'Image processed successfully (development mode - converted to 5-second video)'
        }
        
        logger.info(f"Returning success response for session {session_id}")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/video/<video_id>', methods=['GET'])
def serve_video(video_id):
    """Serve generated video files."""
    try:
        temp_dir = tempfile.gettempdir()
        video_path = os.path.join(temp_dir, f"satellite_{video_id}.mp4")
        
        if not os.path.exists(video_path):
            logger.warning(f"Video file not found: {video_path}")
            return jsonify({'error': 'Video not found'}), 404
        
        # Check file size
        file_size = os.path.getsize(video_path)
        logger.info(f"Serving video: {video_path} (size: {file_size} bytes)")
        
        if file_size == 0:
            logger.error(f"Video file is empty: {video_path}")
            return jsonify({'error': 'Video file is empty'}), 500
        
        # Add CORS headers for video
        response = send_file(
            video_path,
            mimetype='video/mp4',
            as_attachment=False,
            download_name=f'satellite_video_{video_id}.mp4'
        )
        
        # Add headers for better video streaming
        response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Cache-Control'] = 'no-cache'
        
        return response
        
    except Exception as e:
        logger.error(f"Error serving video: {str(e)}")
        return jsonify({'error': 'Failed to serve video'}), 500

@app.route('/test-video/<video_id>', methods=['GET'])
def test_video_info(video_id):
    """Debug endpoint to check video file info."""
    try:
        temp_dir = tempfile.gettempdir()
        video_path = os.path.join(temp_dir, f"satellite_{video_id}.mp4")
        
        info = {
            'video_id': video_id,
            'video_path': video_path,
            'file_exists': os.path.exists(video_path),
            'file_size': os.path.getsize(video_path) if os.path.exists(video_path) else 0,
            'temp_dir': temp_dir
        }
        
        if os.path.exists(video_path):
            # Try to get video info using OpenCV
            try:
                cap = cv2.VideoCapture(video_path)
                if cap.isOpened():
                    info['opencv_readable'] = True
                    info['frame_count'] = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    info['fps'] = cap.get(cv2.CAP_PROP_FPS)
                    info['width'] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    info['height'] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    cap.release()
                else:
                    info['opencv_readable'] = False
            except Exception as e:
                info['opencv_error'] = str(e)
        
        return jsonify(info)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'message': 'Development server is running',
        'authorization_required': True
    })

@app.route('/', methods=['GET'])
def info():
    """Server info endpoint."""
    return jsonify({
        'name': 'Satellite Image Processing Development Server',
        'version': '1.0.0',
        'endpoints': {
            '/api/process-image': 'POST - Process images',
            '/video/<video_id>': 'GET - Serve generated videos',
            '/health': 'GET - Health check',
            '/': 'GET - This info page'
        },
        'authorization_required': True,
        'note': 'This is a development server. It converts satellite images to 5-second looping videos.'
    })

if __name__ == '__main__':
    print(f"""
🚀 Development Server Starting...

📡 Satellite Image Processing Development Server
🔗 URL: http://localhost:{PORT}
🔑 Auth Token: {AUTHORIZATION_TOKEN}
📋 Endpoints:
   • POST /api/process-image - Process images
   • GET  /health - Health check
   • GET  / - Server info

⚠️  Development Mode: Converts images to 5-second looping videos
🔧 Set AUTHORIZATION_TOKEN environment variable to change auth token
    """)
    
    app.run(
        host='0.0.0.0',
        port=PORT,
        debug=True
    ) 