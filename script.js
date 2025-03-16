const API_KEY = "AIzaSyBcXm9WGfjjLLNL3N48BjWvMMBeyvtek1c";
const CHANNEL_IDS = [
  "UC0JqWDXiBBaw7_-aL6DByHw",
  "UCXJyOrMtXJxGwv1x_tH4MYA",
];
const CHANNEL_NAMES = ["Retrora", "Retrora Live"];
const UPLOADS_PLAYLIST_IDS = CHANNEL_IDS.map((id) => "UU" + id.slice(2));
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

let currentChannelIndex = 0;
let currentNewestVideoId;
let cachedData = {};
let apiQueryCount = 0;

/* -------------------- Debug Fetch & Caching -------------------- */
async function debugFetch(url, options) {
  console.debug(`Making API request: ${url}`);
  apiQueryCount++;
  const response = await fetch(url, options);
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

/* -------------------- Video-related Functions -------------------- */
function isShort(video) {
  if (video.duration && video.duration <= 182) {
    return true;
  }
  const title = (video.snippet.title || "").toLowerCase();
  const description = (video.snippet.description || "").toLowerCase();
  return (
    title.includes("#shorts") ||
    title.includes("#short") ||
    title.includes("(shorts)") ||
    title.includes("(short)") ||
    description.includes("#shorts") ||
    description.includes("#short")
  );
}

function generateVideoHTML(video, elementType) {
  const videoId = video.contentDetails.videoId;
  const thumbnail =
    video.snippet.thumbnails.maxres?.url ||
    video.snippet.thumbnails.high?.url ||
    video.snippet.thumbnails.medium.url;
  const title = video.snippet.title;

  if (elementType === "newest") {
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
async function fetchBatchedPlaylistItems(playlistIds) {
  const boundary = `batch_${Date.now()}`;
  let body = "";
  playlistIds.forEach((playlistId) => {
    const urlPath = `/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=50`;
    body += `--${boundary}\r\n`;
    body += "Content-Type: application/http\r\n";
    body += `Content-ID: <${playlistId}>\r\n\r\n`;
    body += `GET ${urlPath} HTTP/1.1\r\n\r\n`;
  });
  body += `--${boundary}--`;
  
  const response = await debugFetch("https://www.googleapis.com/batch/youtube/v3", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
    },
    body: body,
  });
  const responseText = await response.text();
  console.debug("Batched playlistItems raw response:", responseText);
  return { responseText, boundary };
}

function parseBatchResponse(responseText, boundary) {
  const results = {};
  const parts = responseText.split(`--${boundary}`);
  parts.forEach((part) => {
    part = part.trim();
    if (!part || part === "--") return;
    const headerBodySplit = part.indexOf("\r\n\r\n");
    if (headerBodySplit === -1) return;
    const headerSection = part.substring(0, headerBodySplit);
    let bodyPart = part.substring(headerBodySplit + 4).trim();
    const contentIdMatch = headerSection.match(/Content-ID:\s*<([^>]+)>/i);
    let contentId = contentIdMatch ? contentIdMatch[1] : null;
    if (!contentId) return;
    const jsonStart = bodyPart.indexOf("{");
    const jsonEnd = bodyPart.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return;
    const jsonText = bodyPart.substring(jsonStart, jsonEnd + 1);
    try {
      const json = JSON.parse(jsonText);
      results[contentId] = json;
    } catch (error) {
      console.error("Failed to parse JSON for part with Content-ID:", contentId, error);
    }
  });
  console.debug("Parsed batch results:", results);
  return results;
}

async function fetchChannelVideos(playlistId) {
  const cacheKey = getCacheKey("channel", playlistId, "50");
  const cached = getLocalCache(cacheKey);
  if (cached) {
    console.debug("Using cached playlist data for", playlistId);
    displayVideos(cached);
    return;
  }

  const { responseText, boundary } = await fetchBatchedPlaylistItems([playlistId]);
  const batchResult = parseBatchResponse(responseText, boundary);

  let playlistData = batchResult[playlistId];
  if (!playlistData) {
    for (let key in batchResult) {
      if (key.endsWith(playlistId)) {
        playlistData = batchResult[key];
        break;
      }
    }
  }

  if (playlistData && playlistData.items && playlistData.items.length > 0) {
    const videoIds = playlistData.items
      .map((item) => item.contentDetails.videoId)
      .join(",");
    
    const videoUrl = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${videoIds}&part=contentDetails`;
    const videoResponse = await debugFetch(videoUrl);
    const videoData = await videoResponse.json();
    
    const durationMap = {};
    videoData.items.forEach((item) => {
      const duration = parseDuration(item.contentDetails.duration);
      durationMap[item.id] = duration;
    });
    
    const videosWithDuration = playlistData.items.map((item) => ({
      ...item,
      duration: durationMap[item.contentDetails.videoId],
    }));
    
    setLocalCache(cacheKey, videosWithDuration);
    displayVideos(videosWithDuration);
  } else {
    document.getElementById("newest-video").innerHTML = "<p>No videos available.</p>";
    document.getElementById("other-videos").innerHTML = "<p>No videos available.</p>";
  }
  console.info(`Total API queries made: ${apiQueryCount}`);
}

function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function displayVideos(videos) {
  const newestVideoWrapper = document.getElementById("newest-video");
  newestVideoWrapper.innerHTML = '<div class="loading-spinner"></div>';
  
  const nonShortVideos = videos.filter((video) => !isShort(video));
  const newestVideo = nonShortVideos[0];
  
  if (newestVideo) {
    currentNewestVideoId = newestVideo.contentDetails.videoId;
    newestVideoWrapper.innerHTML = generateVideoHTML(newestVideo, "newest");
    
    const videoTitleElem = document.getElementById("video-title");
    videoTitleElem.textContent = newestVideo.snippet.title;
  } else {
    newestVideoWrapper.innerHTML = "<p>No regular videos available.</p>";
    document.getElementById("video-title").textContent = "";
  }
  
  const otherVideosContainer = document.getElementById("other-videos");
  otherVideosContainer.innerHTML = '<div class="loading-spinner"></div>';
  
  const otherVideos = [];
  for (let i = 0; i < nonShortVideos.length && otherVideos.length < 12; i++) {
    if (nonShortVideos[i].contentDetails.videoId !== currentNewestVideoId) {
      otherVideos.push(nonShortVideos[i]);
    }
  }
  
  if (otherVideos.length > 0) {
    otherVideosContainer.innerHTML = otherVideos
      .map((video) => generateVideoHTML(video, "other"))
      .join("");
  } else {
    otherVideosContainer.innerHTML = "<p>No additional videos available.</p>";
  }
}

/* -------------------- Channel Switching -------------------- */
function selectChannel(index) {
  if (index === currentChannelIndex) return;
  currentChannelIndex = index;
  
  document.getElementById("channel-name").textContent =
    `NEWEST VIDEO FROM ${CHANNEL_NAMES[currentChannelIndex].toUpperCase()}`;

  const buttons = document.querySelectorAll(".channel-btn");
  buttons.forEach((btn, btnIndex) => {
    if (btnIndex === currentChannelIndex) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  document.getElementById("newest-video").innerHTML =
    '<div class="loading-spinner"></div>';
  document.getElementById("other-videos").innerHTML =
    '<div class="loading-spinner"></div>';

  const playlistId = UPLOADS_PLAYLIST_IDS[currentChannelIndex];
  fetchChannelVideos(playlistId);
}

/* -------------------- NebulaParticles Class -------------------- */
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
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * width * 2;
      positions[i3 + 1] = (Math.random() - 0.5) * height * 2;
      positions[i3 + 2] = -Math.random() * depthRange;

      const rand = (Math.random() - 0.5) * 0.1;
      colors[i3] = baseColor.r + rand;
      colors[i3 + 1] = baseColor.g + rand;
      colors[i3 + 2] = baseColor.b + rand;

      sizes[i] = 2.0 + Math.random() * 3.0;
      opacity[i] = 2.0;
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
      const { position, size } = this.particles.geometry.attributes;
      const positions = position.array;
      const sizes = size.array;
      const t05 = time * 0.5;
      const t06 = time * 0.6;
      const t04 = time * 0.4;
      const t2 = time * 2;

      for (let i = 0, j = 0; i < positions.length; i += 3, j++) {
        positions[i] += Math.sin(t05 + i) * 0.04;
        positions[i + 1] += Math.cos(t06 + i) * 0.02;
        positions[i + 2] += Math.sin(t04 + i) * 0.02;
        sizes[j] = 0.1 + Math.sin(t2 + i) * 0.8;
      }

      position.needsUpdate = true;
      size.needsUpdate = true;
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

/* -------------------- Initialization -------------------- */
document.addEventListener("DOMContentLoaded", () => {
  if (typeof THREE !== "undefined") {
    new NebulaParticles();
  } else {
    console.error("Three.js not loaded!");
  }

  document.getElementById("channel-name").textContent =
    `NEWEST VIDEO FROM ${CHANNEL_NAMES[currentChannelIndex].toUpperCase()}`;
  fetchChannelVideos(UPLOADS_PLAYLIST_IDS[currentChannelIndex]);

  document.getElementById("channel-btn-0").addEventListener("click", () => {
    selectChannel(0);
  });
  document.getElementById("channel-btn-1").addEventListener("click", () => {
    selectChannel(1);
  });

  const heartEl = document.getElementById("heart");
  const altImageURL =
    "https://cdn.7tv.app/emote/01GM6WDXE80001P7H3QK4M0CG4/1x.gif";
  let isHeart = true;
  heartEl.addEventListener("click", () => {
    if (isHeart) {
      heartEl.innerHTML = `<img src="${altImageURL}" alt="smiley" style="height: 1em; vertical-align: middle;">`;
      heartEl.classList.remove("heart");
    } else {
      heartEl.innerHTML = "❤";
      heartEl.classList.add("heart");
    }
    isHeart = !isHeart;
  });
});
