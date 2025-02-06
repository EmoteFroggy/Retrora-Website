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

function getCacheKey(type, playlistId, additional = "10") {
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
  // If duration is available, use it as primary check
  if (video.duration && video.duration <= 182) {
      return true;
  }

  const title = (video.snippet.title || '').toLowerCase();
  const description = (video.snippet.description || '').toLowerCase();
  
  // Additional checks for shorts indicators
  return title.includes('#shorts') ||
         title.includes('#short') ||
         title.includes('(shorts)') ||
         title.includes('(short)') ||
         description.includes('#shorts') ||
         description.includes('#short') ||
         video.snippet?.title?.startsWith('shorts') ||
         video.snippet?.title?.startsWith('short');
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
          <img src="${thumbnail}" alt="${title}">
          <div class="play-button">
            <i class="fas fa-play"></i>
          </div>
        </div>
        <h3>${title}</h3>
      </a>
    `;
  }
  
  return `
    <a class="video-card-link" href="https://www.youtube.com/watch?v=${videoId}" target="_blank">
      <div class="video-card">
        <img src="${thumbnail}" alt="${title}">
        <div class="info">
          <h3 style="padding-left: 10px;">${title}</h3>
        </div>
      </div>
    </a>
  `;
}

async function fetchChannelVideos(playlistId) {
  const cacheKey = getCacheKey("channel", playlistId, "47");
  const cached = getLocalCache(cacheKey);

  if (cached) {
      displayVideos(cached);
      return;
  }

  try {
      // First, get the playlist items
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=47`;
      const playlistResponse = await fetch(playlistUrl);
      const playlistData = await playlistResponse.json();

      if (playlistData.items && playlistData.items.length > 0) {
          // Get all video IDs
          const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');
          
          // Get video durations
          const videoUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails`;
          const videoResponse = await fetch(videoUrl);
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
      newestVideoWrapper.innerHTML = generateVideoHTML(newestVideo, 'newest');
  } else {
      newestVideoWrapper.innerHTML = "<p>No regular videos available.</p>";
  }

  const otherVideosContainer = document.getElementById("other-videos");
  otherVideosContainer.innerHTML = '<div class="loading-spinner"></div>';

  // Get other non-short videos (excluding the newest)
  const otherVideos = nonShortVideos
      .filter(video => video.contentDetails.videoId !== currentNewestVideoId)
      .slice(0, 12);

  if (otherVideos.length > 0) {
      otherVideosContainer.innerHTML = '';
      otherVideos.forEach(video => {
          otherVideosContainer.innerHTML += generateVideoHTML(video, 'other');
      });
  } else {
      otherVideosContainer.innerHTML = "<p>No additional videos available.</p>";
  }
}


function switchChannel(direction) {
    const leftArrow = document.getElementById("left-arrow");
    const rightArrow = document.getElementById("right-arrow");
    leftArrow.style.pointerEvents = "none";
    rightArrow.style.pointerEvents = "none";

    currentChannelIndex = (currentChannelIndex + direction + CHANNEL_IDS.length) % CHANNEL_IDS.length;
    
    const channelName = CHANNEL_NAMES[currentChannelIndex];
    const playlistId = UPLOADS_PLAYLIST_IDS[currentChannelIndex];
    
    document.getElementById("channel-name").textContent = 
        `NEWEST VIDEO FROM ${channelName.toUpperCase()}`;

    document.getElementById("newest-video").innerHTML = '<div class="loading-spinner"></div>';
    document.getElementById("other-videos").innerHTML = '<div class="loading-spinner"></div>';

    fetchChannelVideos(playlistId).finally(() => {
        leftArrow.style.pointerEvents = "auto";
        rightArrow.style.pointerEvents = "auto";

        if (currentChannelIndex === 0) {
            leftArrow.style.display = "none";
            rightArrow.style.display = "block";
        } else if (currentChannelIndex === 1) {
            leftArrow.style.display = "block";
            rightArrow.style.display = "none";
        }
    });
}

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
      const positions = this.particles.geometry.attributes.position.array;
      const sizes = this.particles.geometry.attributes.size.array;
      const opacity = this.particles.geometry.attributes.opacity.array;

      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += Math.sin(time * 0.5 + i) * 0.04;
        positions[i + 1] += Math.cos(time * 0.6 + i) * 0.02;
        positions[i + 2] += Math.sin(time * 0.4 + i) * 0.02;

        sizes[i / 3] = 0.1 + Math.sin(time * 2 + i) * 0.8;
        opacity[i / 3] = 1 + Math.sin(time * 3 + i) * 2;
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

// Initial load
switchChannel(0);
