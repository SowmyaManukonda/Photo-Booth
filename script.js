document.addEventListener('DOMContentLoaded', async function() {
    // DOM Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const captureBtn = document.getElementById('capture-btn');
    const recordBtn = document.getElementById('record-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');
    const galleryScroll = document.getElementById('gallery-scroll');
    const photoCount = document.getElementById('photo-count');
    const stickersContainer = document.getElementById('stickers-container');
    const countdownElement = document.getElementById('countdown');
    const arOverlay = document.getElementById('ar-overlay');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const modal = document.getElementById('modal');
    const closeModal = document.querySelector('.close-modal');
    const stripCanvas = document.getElementById('strip-canvas');
    const finalDownloadBtn = document.getElementById('final-download');
  
    // App State
    let currentStream = null;
    let capturedPhotos = [];
    let currentFilter = 'normal';
    let activeStickers = [];
    let isRecording = false;
    let capturer = null;
    let faceDetectionInterval = null;
    let selectedBackground = null;
    
    // Initialize camera
    async function initCamera() {
      try {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        video.style.display = 'block';
        canvas.style.display = 'none';
        
        // Initialize face detection when video is ready
        video.onloadedmetadata = () => {
          setupFaceDetection();
        };
        
        return true;
      } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access the camera. Please ensure you've granted camera permissions.");
        return false;
      }
    }
    
    // Face Detection Setup
    async function setupFaceDetection() {
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
      
      // Clear any existing interval
      if (faceDetectionInterval) {
        clearInterval(faceDetectionInterval);
      }
      
      faceDetectionInterval = setInterval(async () => {
        if (video.paused || video.ended) return;
        
        const detections = await faceapi.detectAllFaces(
          video, 
          new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks();
        
        // Clear previous AR elements
        arOverlay.innerHTML = '';
        
        // Process each detected face
        detections.forEach(detection => {
          const landmarks = detection.landmarks;
          const jawOutline = landmarks.getJawOutline();
          const nose = landmarks.getNose();
          const leftEye = landmarks.getLeftEye();
          const rightEye = landmarks.getRightEye();
          const mouth = landmarks.getMouth();
          
          // Update sticker positions based on face landmarks
          activeStickers.forEach(sticker => {
            const stickerElement = document.createElement('div');
            stickerElement.className = 'ar-sticker';
            stickerElement.innerHTML = `<img src="${sticker.src}" alt="sticker">`;
            
            // Position based on sticker type (simplified example)
            if (sticker.type === 'hat') {
              const minX = Math.min(...jawOutline.map(p => p.x));
              const maxX = Math.max(...jawOutline.map(p => p.x));
              const minY = Math.min(...jawOutline.map(p => p.y));
              
              stickerElement.style.width = `${maxX - minX}px`;
              stickerElement.style.left = `${minX}px`;
              stickerElement.style.top = `${minY - (maxX - minX)}px`;
            } else if (sticker.type === 'glasses') {
              const eyeCenterX = (leftEye[0].x + rightEye[3].x) / 2;
              const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2;
              const eyeWidth = rightEye[3].x - leftEye[0].x;
              
              stickerElement.style.width = `${eyeWidth * 1.5}px`;
              stickerElement.style.left = `${eyeCenterX - (eyeWidth * 0.75)}px`;
              stickerElement.style.top = `${eyeCenterY - (eyeWidth * 0.2)}px`;
            }
            
            arOverlay.appendChild(stickerElement);
          });
        });
      }, 300);
    }
    
    // Load stickers
    function loadStickers() {
      const stickers = [
        { src: 'assets/stickers/hat.png', type: 'hat' },
        { src: 'assets/stickers/glasses.png', type: 'glasses' },
        { src: 'assets/stickers/mustache.png', type: 'mustache' },
        { src: 'assets/stickers/heart-eyes.png', type: 'eyes' },
        { src: 'assets/stickers/crown.png', type: 'hat' },
        { src: 'assets/stickers/dog-ears.png', type: 'hat' },
        { src: 'assets/stickers/sunglasses.png', type: 'glasses' },
        { src: 'assets/stickers/rainbow.png', type: 'background' }
      ];
      
      stickers.forEach(sticker => {
        const img = document.createElement('img');
        img.src = sticker.src;
        img.dataset.src = sticker.src;
        img.dataset.type = sticker.type;
        img.addEventListener('click', () => addSticker(sticker));
        stickersContainer.appendChild(img);
      });
    }
    
    // Add sticker to active stickers
    function addSticker(sticker) {
      activeStickers.push({
        src: sticker.src,
        type: sticker.type
      });
    }
    
    // Start countdown before capture
    function startCountdown(seconds, callback) {
      let counter = seconds;
      countdownElement.textContent = counter;
      countdownElement.classList.remove('hidden');
      
      const timer = setInterval(() => {
        counter--;
        countdownElement.textContent = counter;
        
        if (counter <= 0) {
          clearInterval(timer);
          countdownElement.classList.add('hidden');
          callback();
        }
      }, 1000);
    }
    
    // Capture photo
    function capturePhoto() {
      const context = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Apply selected filter
      applyFilter(context, canvas.width, canvas.height);
      
      // Show canvas, hide video
      video.style.display = 'none';
      canvas.style.display = 'block';
      
      // Add to gallery
      addToGallery(canvas.toDataURL('image/png'));
      
      // Enable download button
      downloadBtn.disabled = false;
    }
    
    // Apply filter to canvas
    function applyFilter(context, width, height) {
      switch(currentFilter) {
        case 'grayscale':
          const grayscaleData = context.getImageData(0, 0, width, height);
          const grayscalePixels = grayscaleData.data;
          for (let i = 0; i < grayscalePixels.length; i += 4) {
            const avg = (grayscalePixels[i] + grayscalePixels[i + 1] + grayscalePixels[i + 2]) / 3;
            grayscalePixels[i] = avg;
            grayscalePixels[i + 1] = avg;
            grayscalePixels[i + 2] = avg;
          }
          context.putImageData(grayscaleData, 0, 0);
          break;
          
        case 'sepia':
          const sepiaData = context.getImageData(0, 0, width, height);
          const sepiaPixels = sepiaData.data;
          for (let i = 0; i < sepiaPixels.length; i += 4) {
            const r = sepiaPixels[i];
            const g = sepiaPixels[i + 1];
            const b = sepiaPixels[i + 2];
            
            sepiaPixels[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
            sepiaPixels[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
            sepiaPixels[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
          }
          context.putImageData(sepiaData, 0, 0);
          break;
          
        case 'vintage':
          Caman('#canvas', function() {
            this.brightness(5)
              .contrast(5)
              .sepia(50)
              .vignette('50%', 30)
              .render();
          });
          break;
          
        case 'pixelate':
          const pixelSize = Math.floor(width / 20);
          const pixelData = context.getImageData(0, 0, width, height);
          
          for (let y = 0; y < height; y += pixelSize) {
            for (let x = 0; x < width; x += pixelSize) {
              const pixelPos = (y * width + x) * 4;
              context.fillStyle = `rgba(
                ${pixelData.data[pixelPos]},
                ${pixelData.data[pixelPos + 1]},
                ${pixelData.data[pixelPos + 2]},
                ${pixelData.data[pixelPos + 3]}
              )`;
              context.fillRect(x, y, pixelSize, pixelSize);
            }
          }
          break;
          
        case 'blur':
          context.filter = 'blur(5px)';
          context.drawImage(canvas, 0, 0);
          context.filter = 'none';
          break;
          
        case 'invert':
          const invertData = context.getImageData(0, 0, width, height);
          const invertPixels = invertData.data;
          for (let i = 0; i < invertPixels.length; i += 4) {
            invertPixels[i] = 255 - invertPixels[i];
            invertPixels[i + 1] = 255 - invertPixels[i + 1];
            invertPixels[i + 2] = 255 - invertPixels[i + 2];
          }
          context.putImageData(invertData, 0, 0);
          break;
          
        case 'greenscreen':
          applyGreenScreen('assets/backgrounds/space.jpg', context, width, height);
          break;
      }
    }
    
    // Green screen effect
    function applyGreenScreen(bgImagePath, context, width, height) {
      const imageData = context.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const bgImage = new Image();
      
      bgImage.src = bgImagePath;
      bgImage.onload = function() {
        // Draw background first
        context.drawImage(bgImage, 0, 0, width, height);
        
        // Process each pixel for green screen
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          
          // Check if pixel is green (adjust threshold as needed)
          if (g > r * 1.4 && g > b * 1.4 && g > 100) {
            // Transparent (keep background)
            continue;
          } else {
            // Draw original pixel
            context.fillStyle = `rgba(${r}, ${g}, ${b}, 255)`;
            context.fillRect(
              (i / 4) % width,
              Math.floor((i / 4) / width),
              1, 1
            );
          }
        }
      };
    }
    
    // Add photo to gallery
    function addToGallery(imageData) {
      const img = document.createElement('img');
      img.src = imageData;
      
      img.addEventListener('click', () => {
        // Show clicked photo in main canvas
        const context = canvas.getContext('2d');
        const tempImg = new Image();
        tempImg.src = imageData;
        tempImg.onload = function() {
          canvas.width = tempImg.width;
          canvas.height = tempImg.height;
          context.drawImage(tempImg, 0, 0);
          video.style.display = 'none';
          canvas.style.display = 'block';
          downloadBtn.disabled = false;
        };
      });
      
      galleryScroll.insertBefore(img, galleryScroll.firstChild);
      capturedPhotos.unshift(imageData);
      photoCount.textContent = capturedPhotos.length;
      
      // Auto-scroll gallery
      galleryScroll.scrollLeft = 0;
    }
    
    // Download current photo
    function downloadCurrentPhoto() {
      const link = document.createElement('a');
      link.download = `photo-booth-${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    
    // GIF Recording
    function toggleRecording() {
      if (!isRecording) {
        // Start recording
        capturer = new CCapture({
          format: 'gif',
          workersPath: 'js/',
          framerate: 10,
          verbose: true
        });
        capturer.start();
        isRecording = true;
        recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
        recordBtn.classList.add('btn-danger');
        recordBtn.classList.remove('btn-secondary');
      } else {
        // Stop recording
        capturer.stop();
        capturer.save();
        isRecording = false;
        recordBtn.innerHTML = '<i class="fas fa-video"></i> Record GIF';
        recordBtn.classList.remove('btn-danger');
        recordBtn.classList.add('btn-secondary');
      }
    }
    
    // Capture frame for GIF
    function captureFrame() {
      if (isRecording) {
        capturer.capture(canvas);
      }
      requestAnimationFrame(captureFrame);
    }
    
    // Reset photo booth
    function resetPhotoBooth() {
      initCamera();
      downloadBtn.disabled = true;
      activeStickers = [];
      arOverlay.innerHTML = '';
    }
    
    // Toggle dark mode
    function toggleDarkMode() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      if (currentTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        darkModeToggle.innerHTML = '<i class="fas fa-moon"></i>';
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
      }
    }
    
    // Create photo strip
    function createPhotoStrip(layout) {
      const stripContext = stripCanvas.getContext('2d');
      const photosToUse = capturedPhotos.slice(0, 4);
      
      switch(layout) {
        case 'single':
          stripCanvas.width = 800;
          stripCanvas.height = 600;
          drawPhotoOnStrip(photosToUse[0], 0, 0, 800, 600, stripContext);
          break;
          
        case 'strip4':
          stripCanvas.width = 1200;
          stripCanvas.height = 400;
          stripContext.fillStyle = 'white';
          stripContext.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
          
          photosToUse.forEach((photo, index) => {
            drawPhotoOnStrip(photo, 50 + (index * 300), 50, 250, 300, stripContext);
            // Add decorative borders
            stripContext.strokeStyle = '#ddd';
            stripContext.lineWidth = 10;
            stripContext.strokeRect(50 + (index * 300) - 5, 50 - 5, 250 + 10, 300 + 10);
          });
          break;
          
        case 'grid4':
          stripCanvas.width = 800;
          stripCanvas.height = 800;
          stripContext.fillStyle = 'white';
          stripContext.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
          
          photosToUse.forEach((photo, index) => {
            const row = Math.floor(index / 2);
            const col = index % 2;
            drawPhotoOnStrip(
              photo, 
              50 + (col * 350), 
              50 + (row * 350), 
              300, 
              300, 
              stripContext
            );
          });
          break;
      }
    }
    
    function drawPhotoOnStrip(photo, x, y, width, height, context) {
      const img = new Image();
      img.src = photo;
      img.onload = function() {
        context.drawImage(img, x, y, width, height);
      };
    }
    
    // Event Listeners
    captureBtn.addEventListener('click', () => {
      startCountdown(3, capturePhoto);
    });
    
    downloadBtn.addEventListener('click', downloadCurrentPhoto);
    
    recordBtn.addEventListener('click', toggleRecording);
    
    resetBtn.addEventListener('click', resetPhotoBooth);
    
    darkModeToggle.addEventListener('click', toggleDarkMode);
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        currentFilter = this.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
      });
    });
    
    // Share buttons
    document.querySelectorAll('.btn-share').forEach(btn => {
      btn.addEventListener('click', function() {
        const platform = this.dataset.platform;
        shareToSocial(platform, canvas.toDataURL('image/png'));
      });
    });
    
    // Strip layout buttons
    document.querySelectorAll('.strip-options button').forEach(btn => {
      btn.addEventListener('click', function() {
        createPhotoStrip(this.dataset.layout);
      });
    });
    
    finalDownloadBtn.addEventListener('click', function() {
      const link = document.createElement('a');
      link.download = `photo-strip-${new Date().getTime()}.png`;
      link.href = stripCanvas.toDataURL('image/png');
      link.click();
    });
    
    closeModal.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    
    // Initialize the app
    async function initialize() {
      await initCamera();
      loadStickers();
      captureFrame(); // Start GIF capture frame loop
      
      // Load models for face-api.js
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    }
    
    initialize();
  });
  
  // Social sharing functions
  function shareToSocial(platform, imageData) {
    switch(platform) {
      case 'instagram':
        // Instagram doesn't have a direct API, so we download and suggest upload
        const link = document.createElement('a');
        link.href = imageData;
        link.download = 'photo-booth-instagram.png';
        link.click();
        setTimeout(() => {
          alert('Please upload the downloaded image to Instagram');
        }, 1000);
        break;
        
      case 'facebook':
        // Using Facebook Share Dialog
        if (window.FB) {
          FB.ui({
            method: 'share',
            href: window.location.href,
            quote: 'Check out my photo booth creation!',
            hashtag: '#WebPhotoBooth',
          }, function(response){});
        } else {
          window.open(
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`,
            '_blank'
          );
        }
        break;
        
      case 'twitter':
        window.open(
          `https://twitter.com/intent/tweet?text=My%20photo%20booth%20creation&url=${encodeURIComponent(window.location.href)}`,
          '_blank'
        );
        break;
    }
  }