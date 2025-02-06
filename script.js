const API_KEY = "AIzaSyB1N_HW6LbcI4WsFANVIEX-wP3CL3mtDU0";
const CHANNEL_IDS = [
  "UC0JqWDXiBBaw7_-aL6DByHw",
  "UCXJyOrMtXJxGwv1x_tH4MYA",
];
const CHANNEL_NAMES = ["Retrora & Co.", "Retrora Live"];
let currentChannelIndex = 0;
let currentNewestVideoId;

// Using the uploads playlist (cheaper endpoint)
const UPLOADS_PLAYLIST_IDS = CHANNEL_IDS.map((id) => "UU" + id.slice(2));

// Define expiration time for cache (in milliseconds)
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// In‑memory cache as a fallback
let cachedData = {};

// Helper functions for localStorage caching
function getCacheKey(type, playlistId, additional = "10") {
  return `${type}_${playlistId}_${additional}`;
}

function setLocalCache(key, data) {
  const cacheObject = {
    timestamp: Date.now(),
    data: data,
  };
  localStorage.setItem(key, JSON.stringify(cacheObject));
  // Also update our in-memory cache
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

// Helper function to check if a video is a Short
function isShort(video) {
  const title = video.snippet?.title?.toLowerCase() || '';
  const description = video.snippet?.description?.toLowerCase() || '';
  
  const thumbnailHeight = video.snippet?.thumbnails?.maxres?.height || 0;
  const thumbnailWidth = video.snippet?.thumbnails?.maxres?.width || 0;
  const aspectRatio = thumbnailWidth / thumbnailHeight;

  return (
    title.includes('#shorts') ||
    title.includes('#short') ||
    title.includes('(shorts)') ||
    title.includes('(short)') ||
    description.includes('#shorts') ||
    description.includes('#short') ||
    video.snippet?.title?.startsWith('shorts') ||
    video.snippet?.title?.startsWith('short') ||
    (thumbnailHeight && thumbnailWidth && aspectRatio < 1) ||
    video.snippet?.resourceId?.videoId?.includes('/shorts/')
  );
}

// Additional check for video duration
async function getVideoDuration(videoId) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoId}&part=contentDetails`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.items && data.items[0]) {
      const duration = data.items[0].contentDetails.duration;
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const hours = (parseInt(match[1]) || 0);
      const minutes = (parseInt(match[2]) || 0);
      const seconds = (parseInt(match[3]) || 0);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  } catch (error) {
    console.error("Error fetching video duration:", error);
    return 0;
  }
}

// Fetch the newest video in a playlist (for main video display)
async function fetchNewestVideoFromPlaylist(playlistId, elementId) {
  // Show loading spinner
  document.getElementById(elementId).innerHTML = '<div class="loading-spinner"></div>';

  const cacheKey = getCacheKey("newest", playlistId, "1");
  const cached = getLocalCache(cacheKey);

  if (cached) {
    const nonShortVideo = cached.find(video => !isShort(video));
    if (nonShortVideo) {
      currentNewestVideoId = nonShortVideo.contentDetails.videoId;
      document.getElementById(elementId).innerHTML = `
        <iframe src="https://www.youtube.com/embed/${currentNewestVideoId}" allowfullscreen></iframe>
      `;
      return;
    }
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=20`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      // Find the first non-Short video
      for (const video of data.items) {
        if (!isShort(video)) {
          // Double-check duration
          const duration = await getVideoDuration(video.contentDetails.videoId);
          // If duration is more than 60 seconds, it's likely not a Short
          if (duration > 60) {
            currentNewestVideoId = video.contentDetails.videoId;
            document.getElementById(elementId).innerHTML = `
              <iframe src="https://www.youtube.com/embed/${currentNewestVideoId}" allowfullscreen></iframe>
            `;
            setLocalCache(cacheKey, data.items);
            return;
          }
        }
      }
      document.getElementById(elementId).innerHTML = "<p>No regular videos available.</p>";
    } else {
      document.getElementById(elementId).innerHTML = "<p>No videos available.</p>";
    }
  } catch (error) {
    console.error("Error fetching newest video from playlist:", error);
    document.getElementById(elementId).innerHTML = "<p>Error loading video.</p>";
  }
}

// Fetch exactly 10 of the other videos from the playlist
async function fetchOtherVideosFromPlaylist(playlistId) {
  // Show loading spinner
  document.getElementById("other-videos").innerHTML = '<div class="loading-spinner"></div>';

  const cacheKey = getCacheKey("other", playlistId, "47");
  const cachedItems = getLocalCache(cacheKey);
  if (cachedItems) {
    displayOtherVideos(cachedItems);
    return;
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=47`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Other Videos from Playlist Response:", data);
    if (data.items && data.items.length > 0) {
      setLocalCache(cacheKey, data.items);
      displayOtherVideos(data.items);
    } else {
      document.getElementById("other-videos").innerHTML =
        "<p>No videos available.</p>";
    }
  } catch (error) {
    console.error("Error fetching other videos from playlist:", error);
    document.getElementById("other-videos").innerHTML =
      "<p>Error loading videos.</p>";
  }
}

// Display the other videos
async function displayOtherVideos(videos) {
  const otherVideosContainer = document.getElementById("other-videos");
  otherVideosContainer.innerHTML = '<div class="loading-spinner"></div>';
  const videoIds = videos.map((video) => video.contentDetails.videoId).join(",");
  try {
    const durationResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails`
    );
    const durationData = await durationResponse.json();
    const durationMap = {};
    durationData.items.forEach((item) => {
      durationMap[item.id] = isoDurationToSeconds(item.contentDetails.duration);
    });
    const filtered = videos.filter((video) => {
      const vidId = video.contentDetails.videoId;
      const duration = durationMap[vidId];
      return duration >= 185 && vidId !== currentNewestVideoId && !isShort(video);
    });
    const desiredCount = 12;
    const videosToDisplay = filtered.slice(0, desiredCount);
    
    // Clear loading spinner
    otherVideosContainer.innerHTML = '';
    
    videosToDisplay.forEach((video) => {
      const vidId = video.contentDetails.videoId;
      otherVideosContainer.innerHTML += `
        <a class="video-card-link" href="https://www.youtube.com/watch?v=${vidId}" target="_blank">
          <div class="video-card">
            <img src="${video.snippet.thumbnails.medium.url}" alt="${video.snippet.title}">
            <div class="info">
              <h3 style="padding-left: 10px;">${video.snippet.title}</h3>
            </div>
          </div>
        </a>
      `;
    });
  } catch (error) {
    console.error("Error fetching video durations:", error);
    otherVideosContainer.innerHTML = "<p>Error loading videos.</p>";
  }
}

function isoDurationToSeconds(isoDuration) {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);
  const hours = parseInt(matches[1] || "0", 10);
  const minutes = parseInt(matches[2] || "0", 10);
  const seconds = parseInt(matches[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Switch the channel
// Switch the channel
function switchChannel(direction) {
  // Disable channel switching while loading
  const leftArrow = document.getElementById("left-arrow");
  const rightArrow = document.getElementById("right-arrow");
  leftArrow.style.pointerEvents = "none";
  rightArrow.style.pointerEvents = "none";

  // Update channel index
  currentChannelIndex =
    (currentChannelIndex + direction + CHANNEL_IDS.length) % CHANNEL_IDS.length;
  
  const channelName = CHANNEL_NAMES[currentChannelIndex];
  const playlistId = UPLOADS_PLAYLIST_IDS[currentChannelIndex];
  
  // Update channel name
  document.getElementById("channel-name").textContent = 
    `NEWEST VIDEO FROM ${channelName.toUpperCase()}`;

  // Only update the video sections, not the entire container
  const newestVideo = document.getElementById("newest-video");
  const otherVideos = document.getElementById("other-videos");

  // Show loading states
  newestVideo.innerHTML = '<div class="loading-spinner"></div>';
  otherVideos.innerHTML = '<div class="loading-spinner"></div>';

  // Fetch new content
  Promise.all([
    fetchNewestVideoFromPlaylist(playlistId, "newest-video"),
    fetchOtherVideosFromPlaylist(playlistId)
  ]).finally(() => {
    // Re-enable channel switching
    leftArrow.style.pointerEvents = "auto";
    rightArrow.style.pointerEvents = "auto";

    // Update arrow visibility
    if (currentChannelIndex === 0) {
      leftArrow.style.display = "none";
      rightArrow.style.display = "block";
    } else if (currentChannelIndex === 1) {
      leftArrow.style.display = "block";
      rightArrow.style.display = "none";
    }
  });
}


// Switch channel when page loads
switchChannel(0);

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

    const baseColor = new THREE.Color(0xff688c);
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
