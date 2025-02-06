const API_KEY = "AIzaSyB1N_HW6LbcI4WsFANVIEX-wP3CL3mtDU0";
const CHANNEL_IDS = [
  "UC0JqWDXiBBaw7_-aL6DByHw",
  "UCXJyOrMtXJxGwv1x_tH4MYA",
];
const CHANNEL_NAMES = ["Retrora & Co.", "Retrora Live"];
let currentChannelIndex = 0;

// Using the uploads playlist (cheaper endpoint)
const UPLOADS_PLAYLIST_IDS = CHANNEL_IDS.map(
  (id) => "UU" + id.slice(2)
);

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

// Fetch the newest video in a playlist (for main video display)
async function fetchNewestVideoFromPlaylist(playlistId, elementId) {
  const cacheKey = getCacheKey("newest", playlistId, "1");
  const cached = getLocalCache(cacheKey);
  if (cached) {
    currentNewestVideoId = cached[0].contentDetails.videoId;
    document.getElementById(elementId).innerHTML = `
      <iframe src="https://www.youtube.com/embed/${currentNewestVideoId}" allowfullscreen></iframe>
    `;
    return;
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=1`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Newest Video from Playlist Response:", data);
    if (data.items && data.items.length > 0) {
      currentNewestVideoId = data.items[0].contentDetails.videoId;
      document.getElementById(elementId).innerHTML = `
        <iframe src="https://www.youtube.com/embed/${currentNewestVideoId}" allowfullscreen></iframe>
      `;
      setLocalCache(cacheKey, data.items);
    } else {
      document.getElementById(elementId).innerHTML =
        "<p>No videos available.</p>";
    }
  } catch (error) {
    console.error("Error fetching newest video from playlist:", error);
    document.getElementById(elementId).innerHTML =
      "<p>Error loading video.</p>";
  }
}

// Fetch exactly 10 of the other videos from the playlist
async function fetchOtherVideosFromPlaylist(playlistId) {
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
  otherVideosContainer.innerHTML = "";
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
      return duration >= 185 && vidId !== currentNewestVideoId;
    });
    const desiredCount = 12;
    const videosToDisplay = filtered.slice(0, desiredCount);
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
function switchChannel(direction) {
  currentChannelIndex =
    (currentChannelIndex + direction + CHANNEL_IDS.length) %
    CHANNEL_IDS.length;
  const channelName = CHANNEL_NAMES[currentChannelIndex];
  const playlistId = UPLOADS_PLAYLIST_IDS[currentChannelIndex];
  document.getElementById("channel-name").textContent = `NEWEST VIDEO FROM ${channelName.toUpperCase()}`;
  fetchNewestVideoFromPlaylist(playlistId, "newest-video");
  fetchOtherVideosFromPlaylist(playlistId);
  if (currentChannelIndex === 0) {
    document.getElementById("left-arrow").style.display = "none";
    document.getElementById("right-arrow").style.display = "block";
  } else if (currentChannelIndex === 1) {
    document.getElementById("left-arrow").style.display = "block";
    document.getElementById("right-arrow").style.display = "none";
  }
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

    const baseColor = new THREE.Color(0xffffff);
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

      // Initial size variation (smaller range)
      sizes[i] = 2.0 + Math.random() * 3.0; // Reduced size range
      opacity[i] = 1.0 + Math.random() * 2.0; // Higher opacity for visibility
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
          gl_PointSize = size * (150.0 / -mvPosition.z); // Adjust size based on distance
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
        // Position variation
        positions[i] += Math.sin(time * 0.5 + i) * 0.04;
        positions[i + 1] += Math.cos(time * 0.6 + i) * 0.02;
        positions[i + 2] += Math.sin(time * 0.4 + i) * 0.02;

        // Size variation
        sizes[i / 3] = 0.1 + Math.sin(time * 2 + i) * 0.8;

        // Opacity variation (shimmer effect)
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
