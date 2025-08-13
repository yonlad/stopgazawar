// Global variables
let map;
let selectedLat = null;
let selectedLng = null;
let currentMode = null; // 'find' or 'browse'
let currentSessionId = null;

// Generate unique session ID for each user
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    const findLocationBtn = document.getElementById('find-location');
    const browseImagesBtn = document.getElementById('browse-images');
    const continueBtn = document.getElementById('continue-btn');
    const selectLocationBtn = document.getElementById('select-location');
    const newAnalysisBtn = document.getElementById('new-analysis-btn');

    findLocationBtn.addEventListener('click', handleFindLocation);
    browseImagesBtn.addEventListener('click', handleBrowseImages);
    continueBtn.addEventListener('click', handleContinue);
    selectLocationBtn.addEventListener('click', handleSelectLocation);
    newAnalysisBtn.addEventListener('click', handleNewAnalysis);
});

// Handle "Find Your Satellite Image" button
function handleFindLocation(e) {
    e.preventDefault();
    currentMode = 'find';
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                selectedLat = lat;
                selectedLng = lng;
                displaySatelliteImage(lat, lng);
            },
            function(error) {
                alert('Error getting your location: ' + error.message);
            }
        );
    } else {
        alert('Geolocation is not supported by this browser.');
    }
}

// Handle "Browse Satellite Images" button
function handleBrowseImages(e) {
    e.preventDefault();
    currentMode = 'browse';
    
    hideAllContainers();
    document.getElementById('map-container').classList.remove('hidden');
    
    // Initialize map if not already done
    if (!map) {
        initMap();
    }
}

// Initialize Google Maps
function initMap() {
    // Default to New York City
    const defaultLocation = { lat: 40.7128, lng: -74.0060 };
    
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 10,
        center: defaultLocation,
        mapTypeId: 'satellite',
        disableDefaultUI: true, // Remove all controls
        zoomControl: true, // Keep only zoom control
        gestureHandling: 'greedy' // Allow normal scrolling without overlay
    });

    // Add click listener to map
    map.addListener('click', function(event) {
        selectedLat = event.latLng.lat();
        selectedLng = event.latLng.lng();
        
        // Clear existing markers
        if (window.currentMarker) {
            window.currentMarker.setMap(null);
        }
        
        // Add new marker
        window.currentMarker = new google.maps.Marker({
            position: { lat: selectedLat, lng: selectedLng },
            map: map,
            title: 'Selected Location'
        });
    });
}

// Handle location selection from map
function handleSelectLocation() {
    if (selectedLat && selectedLng) {
        displaySatelliteImage(selectedLat, selectedLng);
    } else {
        alert('Please select a location on the map first.');
    }
}

// Display satellite image using Google Static Maps API
function displaySatelliteImage(lat, lng) {
    hideAllContainers();
    
    // Use API key from config - zoom=19 for closer view
    const imageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=512x512&maptype=satellite&key=${CONFIG.GOOGLE_MAPS_API_KEY}`;
    
    const img = document.getElementById('satellite-image');
    img.src = imageUrl;
    img.onload = function() {
        document.getElementById('result-container').classList.remove('hidden');
    };
    img.onerror = function() {
        alert('Error loading satellite image. Please check your API key configuration.');
    };
}

// Handle continue button - process the selected satellite image
async function handleContinue() {
    if (selectedLat && selectedLng) {
        // Generate session ID for this request
        currentSessionId = generateSessionId();
        
        try {
            // Show processing screen
            hideAllContainers();
            document.getElementById('processing-container').classList.remove('hidden');
            
            // Get the current satellite image URL
            const satelliteImageUrl = document.getElementById('satellite-image').src;
            
            // Fetch and process the image
            await processImageWithBackend(satelliteImageUrl, selectedLat, selectedLng);
            
        } catch (error) {
            console.error('Error processing image:', error);
            alert('Error processing your image. Please try again.');
            
            // Return to the image selection
            hideAllContainers();
            document.getElementById('result-container').classList.remove('hidden');
        }
    }
}

// Process image with backend API
async function processImageWithBackend(imageUrl, lat, lng) {
    try {
        // First, fetch the image data
        const imageBlob = await fetchImageAsBlob(imageUrl);
        
        // Create FormData to send to backend
        const formData = new FormData();
        formData.append('image', imageBlob, 'satellite_image.png');
        formData.append('latitude', lat.toString());
        formData.append('longitude', lng.toString());
        formData.append('session_id', currentSessionId);
        
        // Use backend API URL from config
        const backendApiUrl = CONFIG.BACKEND_API_URL;
        
        // Send POST request to backend with authorization header
        const response = await fetch(backendApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.AUTHORIZATION_TOKEN}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }
        
        // Get the response (expecting video file or video URL)
        const result = await response.json();
        
        // Display results
        displayResults(imageUrl, result.video_url || result.videoUrl);
        
    } catch (error) {
        console.error('Error calling backend API:', error);
        throw error;
    }
}

// Fetch image as blob from URL
async function fetchImageAsBlob(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error('Failed to fetch image');
    }
    return await response.blob();
}

// Display results with original image and generated video
function displayResults(originalImageUrl, videoUrl) {
    hideAllContainers();
    
    // Set the original image
    document.getElementById('original-image').src = originalImageUrl;
    
    // Set the video source with error handling
    const video = document.getElementById('result-video');
    const source = video.querySelector('source');
    
    // Remove any existing event listeners to avoid duplicates
    video.removeEventListener('loadstart', videoLoadStart);
    video.removeEventListener('loadeddata', videoLoadedData);
    video.removeEventListener('canplay', videoCanPlay);
    video.removeEventListener('error', videoError);
    video.removeEventListener('loadedmetadata', videoLoadedMetadata);
    source.removeEventListener('error', sourceError);
    
    // Define event handlers
    function videoLoadStart() {
        console.log('🎬 Video loading started:', videoUrl);
    }
    
    function videoLoadedData() {
        console.log('📊 Video data loaded successfully');
        console.log('Video properties:', {
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState
        });
    }
    
    function videoLoadedMetadata() {
        console.log('📋 Video metadata loaded');
        // Try to force play if autoplay failed
        video.play().catch(e => {
            console.log('⚠️ Autoplay prevented, user interaction required:', e);
        });
    }
    
    function videoCanPlay() {
        console.log('▶️ Video can start playing');
    }
    
    function videoError(e) {
        console.error('❌ Video error:', e);
        console.error('Video error details:', video.error);
        if (video.error) {
            console.error('Error code:', video.error.code);
            console.error('Error message:', video.error.message);
        }
        
        // Try fallback: set src directly instead of using source element
        console.log('🔄 Trying fallback: setting video.src directly');
        video.src = videoUrl;
        video.load();
    }
    
    function sourceError(e) {
        console.error('❌ Video source error:', e);
    }
    
    // Add event listeners for debugging
    video.addEventListener('loadstart', videoLoadStart);
    video.addEventListener('loadeddata', videoLoadedData);
    video.addEventListener('loadedmetadata', videoLoadedMetadata);
    video.addEventListener('canplay', videoCanPlay);
    video.addEventListener('error', videoError);
    source.addEventListener('error', sourceError);
    
    // Additional debugging events
    video.addEventListener('playing', () => console.log('🎵 Video started playing'));
    video.addEventListener('pause', () => console.log('⏸️ Video paused'));
    video.addEventListener('ended', () => console.log('🏁 Video ended'));
    video.addEventListener('stalled', () => console.log('🚫 Video stalled'));
    video.addEventListener('waiting', () => console.log('⏳ Video waiting'));
    
    // Reset video properties
    video.currentTime = 0;
    
    // Try two approaches: both source element and direct src
    source.src = videoUrl;
    video.src = videoUrl;  // Also set directly as fallback
    console.log('🔗 Setting video source to:', videoUrl);
    
    // Force reload
    video.load();
    
    // Add a manual test button for debugging
    addVideoTestButton(video, videoUrl);
    
    // Show results container
    document.getElementById('results-display').classList.remove('hidden');
    
    // Log video element state
    setTimeout(() => {
        console.log('📈 Video element state after 1 second:', {
            src: video.src,
            currentSrc: video.currentSrc,
            readyState: video.readyState,
            networkState: video.networkState,
            error: video.error
        });
    }, 1000);
}

// Add test button for video debugging
function addVideoTestButton(video, videoUrl) {
    // Remove existing test button if any
    const existingButton = document.getElementById('video-test-btn');
    if (existingButton) {
        existingButton.remove();
    }
    
    // Create test button
    const testButton = document.createElement('button');
    testButton.id = 'video-test-btn';
    testButton.textContent = '🔧 Test Video URL';
    testButton.className = 'continue-button';
    testButton.style.marginTop = '10px';
    testButton.style.fontSize = '0.9rem';
    
    testButton.onclick = () => {
        console.log('🧪 Manual video test clicked');
        
        // Test if URL is accessible
        fetch(videoUrl)
            .then(response => {
                console.log('📡 Video URL response:', response.status, response.statusText);
                console.log('📡 Content-Type:', response.headers.get('content-type'));
                console.log('📡 Content-Length:', response.headers.get('content-length'));
                
                if (response.ok) {
                    // Try opening video in new tab
                    window.open(videoUrl, '_blank');
                } else {
                    alert(`Video URL not accessible: ${response.status} ${response.statusText}`);
                }
            })
            .catch(error => {
                console.error('❌ Error testing video URL:', error);
                alert(`Error accessing video URL: ${error.message}`);
            });
    };
    
    // Add button after the video
    const videoContainer = video.closest('.result-item');
    if (videoContainer) {
        videoContainer.appendChild(testButton);
    }
}

// Handle new analysis button
function handleNewAnalysis() {
    // Reset session
    currentSessionId = null;
    selectedLat = null;
    selectedLng = null;
    
    // Hide results and show initial buttons
    hideAllContainers();
    
    // Reset the main interface
    location.reload(); // Simple way to reset everything
}

// Utility function to hide all containers
function hideAllContainers() {
    document.getElementById('result-container').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('processing-container').classList.add('hidden');
    document.getElementById('results-display').classList.add('hidden');
}

// Validate configuration
window.addEventListener('load', function() {
    if (CONFIG.GOOGLE_MAPS_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('⚠️ Please update your Google Maps API key in config.js');
        alert('Please set your Google Maps API key in config.js file');
    }
    
    if (CONFIG.BACKEND_API_URL === 'http://localhost:3000/api/process-image') {
        console.warn('⚠️ Using default backend API URL. Update BACKEND_API_URL in config.js if needed');
    }
    
    if (CONFIG.AUTHORIZATION_TOKEN === 'your_secret_token_here') {
        console.warn('⚠️ Please update your authorization token in config.js for security');
    }
}); 