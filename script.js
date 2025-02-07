const API_KEY = "AIzaSyB1N_HW6LbcI4WsFANVIEX-wP3CL3mtDU0";
const CHANNEL_IDS = [
  "UC0JqWDXiBBaw7_-aL6DByHw",
  "UCXJyOrMtXJxGwv1x_tH4MYA",
];
const CHANNEL_NAMES = ["Retrora & Co.", "Retrora Live"];
const UPLOADS_PLAYLIST_IDS = CHANNEL_IDS.map((id) => "UU" + id.slice(2));
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

let currentChannelIndex = 0;
let currentNewestVideoId;
let cachedData = {};
let apiQueryCount = 0;

async function debugFetch(url, options) {
  console.debug(`Making API request: ${url}`);
  apiQueryCount++;
  const response = await fetch(url, options);
  // Optionally log the current count after each request.
  console.debug(`API Query Count: ${apiQueryCount}`);
  return response;
}

function getCacheKey(type, playlistId, additional) {
  return `${type}_${playlistId}_${additional}`;
}

function setLocalCache(key, data) {
  const cacheObject = {
    timestamp: Date.now(),
    data: data,
  };
  localStorage.setItem(key, JSON.stringify(cacheObject));
  cachedData[key] = cacheObject;
}

function getLocalCache(key) {
  if (cachedData[key]) {
    if (Date.now() - cachedData[key].timestamp < CACHE_EXPIRY_MS) {
      return cachedData[key].data;
    }
    delete cachedData[key];
    localStorage.removeItem(key);
    return null;
  }
  const item = localStorage.getItem(key);
  if (!item) return null;
  try {
    const cacheObject = JSON.parse(item);
    if (Date.now() - cacheObject.timestamp < CACHE_EXPIRY_MS) {
      cachedData[key] = cacheObject;
      return cacheObject.data;
    } else {
      localStorage.removeItem(key);
      return null;
    }
  } catch (e) {
    console.error("Error reading cache", e);
    localStorage.removeItem(key);
    return null;
  }
}

function isShort(video) {
  if (video.duration && video.duration <= 182) {
      return true;
  }

  const title = (video.snippet.title || '').toLowerCase();
  const description = (video.snippet.description || '').toLowerCase();

  return title.includes('#shorts') ||
         title.includes('#short') ||
         title.includes('(shorts)') ||
         title.includes('(short)') ||
         description.includes('#shorts') ||
         description.includes('#short');
}



function generateVideoHTML(video, elementType) {
  const videoId = video.contentDetails.videoId;
  const thumbnail = video.snippet.thumbnails.maxres?.url || 
                   video.snippet.thumbnails.high?.url || 
                   video.snippet.thumbnails.medium.url;
  const title = video.snippet.title;

  if (elementType === 'newest') {
    return `
      <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" class="newest-video-link">
        <div class="newest-thumbnail">
          <img src="${thumbnail}">
          <div class="play-button">
            <i class="fas fa-play"></i>
          </div>
        </div>
      </a>
    `;
  }
  
  return `
    <a class="video-card-link" href="https://www.youtube.com/watch?v=${videoId}" target="_blank">
      <div class="video-card">
        <img src="${thumbnail}">
        <div class="info">
          <h3 style="padding-left: 10px;">${title}</h3>
        </div>
      </div>
    </a>
  `;
}

async function fetchChannelVideos(playlistId) {
  const cacheKey = getCacheKey("channel", playlistId, "50");
  const cached = getLocalCache(cacheKey);

  if (cached) {
      displayVideos(cached);
      return;
  }

  try {
      // First, get the playlist items
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=50`;
      const playlistResponse = await debugFetch(playlistUrl);
      const playlistData = await playlistResponse.json();

      if (playlistData.items && playlistData.items.length > 0) {
          // Get all video IDs
          const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');
          
          // Get video durations
          const videoUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails`;
          const videoResponse = await debugFetch(videoUrl);
          const videoData = await videoResponse.json();

          // Create duration map
          const durationMap = {};
          videoData.items.forEach(item => {
              const duration = parseDuration(item.contentDetails.duration);
              durationMap[item.id] = duration;
          });

          // Add duration to playlist items
          const videosWithDuration = playlistData.items.map(item => ({
              ...item,
              duration: durationMap[item.contentDetails.videoId]
          }));

          setLocalCache(cacheKey, videosWithDuration);
          displayVideos(videosWithDuration);
      } else {
          document.getElementById("newest-video").innerHTML = "<p>No videos available.</p>";
          document.getElementById("other-videos").innerHTML = "<p>No videos available.</p>";
      }
  } catch (error) {
      console.error("Error fetching videos:", error);
      document.getElementById("newest-video").innerHTML = "<p>Error loading video.</p>";
      document.getElementById("other-videos").innerHTML = "<p>Error loading videos.</p>";
  }
  console.info(`Total API queries made: ${apiQueryCount}`);
}

function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

function displayVideos(videos) {
  const newestVideoWrapper = document.getElementById("newest-video");
  newestVideoWrapper.innerHTML = '<div class="loading-spinner"></div>';

  // Filter non-short videos first
  const nonShortVideos = videos.filter(video => !isShort(video));

  // Find newest non-short video
  const newestVideo = nonShortVideos[0];
  if (newestVideo) {
    currentNewestVideoId = newestVideo.contentDetails.videoId;
    // Update the video player container
    newestVideoWrapper.innerHTML = generateVideoHTML(newestVideo, 'newest');
    
    // Update the new element with the title of the newest video
    const videoTitleElem = document.getElementById("video-title");
    videoTitleElem.textContent = newestVideo.snippet.title;
  } else {
    newestVideoWrapper.innerHTML = "<p>No regular videos available.</p>";
    document.getElementById("video-title").textContent = "";
  }

  const otherVideosContainer = document.getElementById("other-videos");
  otherVideosContainer.innerHTML = '<div class="loading-spinner"></div>';

  let otherVideos = [];
  for (let i = 0; i < nonShortVideos.length && otherVideos.length < 12; i++) {
    if (nonShortVideos[i].contentDetails.videoId !== currentNewestVideoId) {
      otherVideos.push(nonShortVideos[i]);
    }
  }

  if (otherVideos.length > 0) {
      otherVideosContainer.innerHTML = '';
      otherVideos.forEach(video => {
          otherVideosContainer.innerHTML += generateVideoHTML(video, 'other');
      });
  } else {
      otherVideosContainer.innerHTML = "<p>No additional videos available.</p>";
  }
}


    function selectChannel(index) {
      // Avoid unnecessary work if the channel is already active.
      if (index === currentChannelIndex) return;

      currentChannelIndex = index;
      
      // Update the channel header text.
      document.getElementById("channel-name").textContent =
        `NEWEST VIDEO FROM ${CHANNEL_NAMES[currentChannelIndex].toUpperCase()}`;

      // Update the active styling on the channel buttons.
      const buttons = document.querySelectorAll(".channel-btn");
      buttons.forEach((btn, btnIndex) => {
        if (btnIndex === currentChannelIndex) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });

      // Show loading spinners in the video containers.
      document.getElementById("newest-video").innerHTML =
        '<div class="loading-spinner"></div>';
      document.getElementById("other-videos").innerHTML =
        '<div class="loading-spinner"></div>';

      // Fetch the videos for the selected channel.
      const playlistId = UPLOADS_PLAYLIST_IDS[currentChannelIndex];
      fetchChannelVideos(UPLOADS_PLAYLIST_IDS[currentChannelIndex]);
    }

    // Attach event listeners to the channel buttons.
    document.getElementById("channel-btn-0").addEventListener("click", () => {
      selectChannel(0);
    });
    document.getElementById("channel-btn-1").addEventListener("click", () => {
      selectChannel(1);
    });

class NebulaParticles {
  constructor() {
    this.initScene();
    this.createParticles();
    this.animate();
    this.addEventListeners();
  }

  initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(
      window.innerWidth / -2,
      window.innerWidth / 2,
      window.innerHeight / 2,
      window.innerHeight / -2,
      -1000,
      1000
    );
    this.camera.position.z = 50;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);
  }

  createParticles() {
    const PARTICLE_COUNT = 25000;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const opacity = new Float32Array(PARTICLE_COUNT);

    const baseColor = new THREE.Color(0xFF688C);
    const depthRange = 5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * window.innerWidth * 2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * window.innerHeight * 2;
      positions[i * 3 + 2] = -Math.random() * depthRange;

      const color = baseColor.clone();
      color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = 2.0 + Math.random() * 3.0;
      opacity[i] = 1.0 + Math.random() * 2.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("opacity", new THREE.BufferAttribute(opacity, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: {
          value: new THREE.TextureLoader().load(
            "https://threejs.org/examples/textures/sprites/disc.png"
          ),
        },
      },
      vertexShader: `
        attribute vec3 color;
        attribute float size;
        attribute float opacity;
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vOpacity = opacity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, vOpacity);
          gl_FragColor = gl_FragColor * texture2D(pointTexture, gl_PointCoord);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, this.material);
    this.scene.add(this.particles);
  }

  animate() {
    const clock = new THREE.Clock();

    const animateFrame = () => {
      requestAnimationFrame(animateFrame);

      if (!this.particles) return;

      const time = clock.getElapsedTime();
      const attributes = this.particles.geometry.attributes;
      const positions = attributes.position.array;
      const sizes = attributes.size.array;
      const opacity = attributes.opacity.array;

      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += Math.sin(time * 0.5 + i) * 0.04;
        positions[i + 1] += Math.cos(time * 0.6 + i) * 0.02;
        positions[i + 2] += Math.sin(time * 0.4 + i) * 0.02;

        sizes[i / 3] = 0.1 + Math.sin(time * 2 + i) * 0.8;
        opacity[i / 3] = 2.0;
      }


      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.size.needsUpdate = true;
      this.particles.geometry.attributes.opacity.needsUpdate = true;

      this.renderer.render(this.scene, this.camera);
    };

    animateFrame();
  }

  addEventListeners() {
    window.addEventListener("resize", () => {
      this.camera.left = window.innerWidth / -2;
      this.camera.right = window.innerWidth / 2;
      this.camera.top = window.innerHeight / 2;
      this.camera.bottom = window.innerHeight / -2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
}

if (typeof THREE !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => new NebulaParticles());
} else {
  console.error("Three.js not loaded!");
}

document.addEventListener("DOMContentLoaded", () => {
  // Set the header text to reflect the default channel (index 0)
  document.getElementById("channel-name").textContent =
    `NEWEST VIDEO FROM ${CHANNEL_NAMES[currentChannelIndex].toUpperCase()}`;

  // Load the default channel videos
  fetchChannelVideos(UPLOADS_PLAYLIST_IDS[currentChannelIndex]);
});

// Initial load
// Initial load
fetchChannelVideos(UPLOADS_PLAYLIST_IDS[currentChannelIndex]);

