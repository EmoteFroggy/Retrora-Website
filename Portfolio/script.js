const API_KEY = "AIzaSyBcXm9WGfjjLLNL3N48BjWvMMBeyvtek1c";
const CHANNEL_IDS = [
  "UC0JqWDXiBBaw7_-aL6DByHw",
  "UCXJyOrMtXJxGwv1x_tH4MYA",
  "UCiY1MH5m6RJj5E_WurAzB7w",
];
const CHANNEL_NAMES = ["Retrora", "Retrora Live", "Retrora Clips"];
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
  console.debug(`API Query Count: ${apiQueryCount}`);
  const response = await fetch(url, options);
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
  // Skip filtering for Clips channel
  if (currentChannelIndex === 2) {
    return false;
  }

  // Log video details for debugging
  console.log(`[Filter] Checking video: "${video.snippet.title}"`);
  console.log(`[Filter] Duration: ${video.duration} seconds`);

  // STRICT DURATION CHECK: If video is 3 minutes (180 seconds) or shorter, it's a short
  if (!video.duration || video.duration <= 180) {
    console.log(`[Filter] Video "${video.snippet.title}" filtered as short due to duration: ${video.duration} seconds`);
    return true;
  }

  // Check for shorts tags
  const title = (video.snippet.title || "").toLowerCase();
  const description = (video.snippet.description || "").toLowerCase();
  
  const shortsTags = [
    "#shorts",
    "#short",
    "(shorts)",
    "(short)",
    "[shorts]",
    "[short]",
    "shorts:",
    "short:",
    "shorts -",
    "short -"
  ];
  
  const hasShortsTag = shortsTags.some(tag => 
    title.includes(tag) || description.includes(tag)
  );

  if (hasShortsTag) {
    console.log(`[Filter] Video "${video.snippet.title}" filtered as short due to tags in title/description`);
    return true;
  }

  console.log(`[Filter] Video "${video.snippet.title}" is not a short (duration: ${video.duration} seconds)`);
  return false;
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
  let allResults = [];
  let nextPageToken = null;
  let pageCount = 0;
  
  // Determine max pages based on channel index
  const channelIndex = UPLOADS_PLAYLIST_IDS.indexOf(playlistIds[0]);
  const MAX_PAGES = channelIndex === 0 ? 2 : 1; // 100 videos for main channel (2 pages), 50 for others (1 page)
  
  console.log(`[Stats] Fetching videos for channel index ${channelIndex}. Max pages: ${MAX_PAGES}`);
  
  do {
    const boundary = `batch_${Date.now()}`;
    let body = "";
    
    for (const playlistId of playlistIds) {
      const urlPath = `/youtube/v3/playlistItems?key=${API_KEY}&playlistId=${playlistId}&part=snippet,contentDetails&order=date&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
      body += `--${boundary}\r\n`;
      body += "Content-Type: application/http\r\n";
      body += `Content-ID: <${playlistId}_page${pageCount}>\r\n\r\n`;
      body += `GET ${urlPath} HTTP/1.1\r\n\r\n`;
    }
    body += `--${boundary}--`;
    
    console.log(`[Debug] Making request for page ${pageCount + 1}${nextPageToken ? ` with token: ${nextPageToken}` : ''}`);
    
    const response = await debugFetch("https://www.googleapis.com/batch/youtube/v3", {
      method: "POST",
      headers: {
        "Content-Type": `multipart/mixed; boundary=${boundary}`,
      },
      body: body,
    });
    
    const responseText = await response.text();
    const batchResult = parseBatchResponse(responseText, boundary);
    
    // Process results and get nextPageToken
    for (const key in batchResult) {
      if (batchResult[key].items) {
        allResults = allResults.concat(batchResult[key].items);
        // Get nextPageToken from the response
        if (batchResult[key].nextPageToken) {
          nextPageToken = batchResult[key].nextPageToken;
          console.log(`[Debug] Found nextPageToken: ${nextPageToken}`);
        }
      }
    }
    
    pageCount++;
    console.log(`[Stats] Fetched page ${pageCount}, total videos so far: ${allResults.length}`);
    
  } while (nextPageToken && pageCount < MAX_PAGES);
  
  console.log(`[Stats] Total videos fetched for ${playlistIds[0]}: ${allResults.length}`);
  return { items: allResults };
}

function parseBatchResponse(responseText, boundary) {
  if (!responseText || !boundary) {
    console.error("[Error] Missing responseText or boundary");
    return {};
  }

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
    
    // Find the start of the JSON response
    const jsonStart = bodyPart.indexOf("{");
    if (jsonStart === -1) return;
    
    // Find the end of the JSON response
    let jsonEnd = bodyPart.lastIndexOf("}");
    if (jsonEnd === -1) return;
    
    // Extract just the JSON part
    const jsonText = bodyPart.substring(jsonStart, jsonEnd + 1);
    
    try {
      const json = JSON.parse(jsonText);
      results[contentId] = json;
    } catch (error) {
      console.error("[Error] Failed to parse JSON for part with Content-ID:", contentId, error);
      console.error("[Debug] JSON text that failed to parse:", jsonText);
    }
  });
  
  return results;
}

async function fetchChannelVideos(playlistId) {
  // Get channel index and determine max videos
  const channelIndex = UPLOADS_PLAYLIST_IDS.indexOf(playlistId);
  const maxVideos = channelIndex === 0 ? 100 : 50; // 100 for main channel, 50 for others
  const cacheKey = getCacheKey("channel", playlistId, maxVideos.toString());
  
  console.log(`[Debug] Fetching videos for channel ${CHANNEL_NAMES[channelIndex]} (${playlistId})`);
  
  // Check cache first
  const cached = getLocalCache(cacheKey);
  if (cached) {
    console.debug("Using cached playlist data for", playlistId);
    displayVideos(cached);
    return;
  }

  try {
    // Reset API query count at the start of a new fetch
    apiQueryCount = 0;
    console.log(`[Stats] Starting new video fetch for channel ${CHANNEL_NAMES[channelIndex]}. API Query Count: 0`);
    
    const playlistData = await fetchBatchedPlaylistItems([playlistId]);
    
    if (!playlistData || !playlistData.items || playlistData.items.length === 0) {
      console.error("[Error] No playlist data received");
      document.getElementById("newest-video").innerHTML = "<p>No videos available.</p>";
      document.getElementById("other-videos").innerHTML = "<p>No videos available.</p>";
      return;
    }

    console.log(`[Debug] Raw playlist data first few items:`, playlistData.items.slice(0, 5).map(item => ({
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      videoId: item.contentDetails.videoId
    })));

    console.log(`[Debug] Fetching durations for ${playlistData.items.length} videos`);
    
    // Get all video IDs
    const videoIds = playlistData.items.map(item => item.contentDetails.videoId);
    const durationMap = {};
    
    // Fetch durations in chunks of 50
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const url = `https://www.googleapis.com/youtube/v3/videos?key=${API_KEY}&id=${chunk.join(",")}&part=contentDetails`;
      
      console.log(`[Debug] Fetching durations for chunk ${i/50 + 1}`);
      const response = await debugFetch(url);
      const data = await response.json();
      
      if (data.items) {
        data.items.forEach(item => {
          if (item.contentDetails && item.contentDetails.duration) {
            const duration = parseDuration(item.contentDetails.duration);
            durationMap[item.id] = duration;
            console.log(`[Debug] Video ${item.id} duration: ${duration} seconds`);
          }
        });
      }
    }
    
    const videosWithDuration = playlistData.items.map((item) => {
      const videoId = item.contentDetails.videoId;
      const duration = durationMap[videoId];
      console.log(`[Debug] Mapping duration for video ${videoId}: ${duration} seconds`);
      return {
        ...item,
        duration: duration
      };
    });
    
    console.log(`[Debug] Final videos with duration first few items:`, videosWithDuration.slice(0, 5).map(v => ({
      title: v.snippet.title,
      duration: v.duration,
      publishedAt: v.snippet.publishedAt
    })));
    
    setLocalCache(cacheKey, videosWithDuration);
    displayVideos(videosWithDuration);
    
    // Log final API query count
    console.log(`[Stats] Total API Queries Made: ${apiQueryCount}`);
  } catch (error) {
    console.error("[Error] Failed to fetch channel videos:", error);
    document.getElementById("newest-video").innerHTML = "<p>Error loading videos.</p>";
    document.getElementById("other-videos").innerHTML = "<p>Error loading videos.</p>";
  }
}

function parseDuration(duration) {
  if (!duration) {
    console.error("[Error] No duration provided to parse");
    return null;
  }
  
  console.log(`[Debug] Parsing duration: ${duration}`);
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    console.error("[Error] Could not parse duration:", duration);
    return null;
  }
  
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  
  console.log(`[Debug] Parsed duration: ${hours}h ${minutes}m ${seconds}s = ${totalSeconds} seconds`);
  return totalSeconds;
}

function displayVideos(videos) {
  const newestVideoWrapper = document.getElementById("newest-video");
  newestVideoWrapper.innerHTML = '<div class="loading-spinner"></div>';
  
  console.log(`[Stats] Total videos fetched: ${videos.length}`);
  console.log("[Debug] First few videos:", videos.slice(0, 5).map(v => ({
    title: v.snippet.title,
    duration: v.duration,
    publishedAt: v.snippet.publishedAt
  })));
  
  // Filter out shorts first
  const nonShortVideos = videos.filter((video) => !isShort(video));
  console.log(`[Stats] Videos after removing shorts: ${nonShortVideos.length}`);
  console.log("[Debug] First few non-short videos:", nonShortVideos.slice(0, 5).map(v => ({
    title: v.snippet.title,
    duration: v.duration,
    publishedAt: v.snippet.publishedAt
  })));
  
  if (nonShortVideos.length === 0) {
    console.log("[Stats] No non-short videos found after filtering");
    newestVideoWrapper.innerHTML = "<p>No regular videos available.</p>";
    document.getElementById("other-videos").innerHTML = "<p>No regular videos available.</p>";
    return;
  }
  
  const newestVideo = nonShortVideos[0];
  currentNewestVideoId = newestVideo.contentDetails.videoId;
  console.log(`[Stats] Newest video: "${newestVideo.snippet.title}" (${newestVideo.duration} seconds)`);
  console.log("[Debug] Newest video details:", {
    title: newestVideo.snippet.title,
    duration: newestVideo.duration,
    publishedAt: newestVideo.snippet.publishedAt,
    videoId: newestVideo.contentDetails.videoId
  });
  
  newestVideoWrapper.innerHTML = generateVideoHTML(newestVideo, "newest");
  document.getElementById("video-title").textContent = newestVideo.snippet.title;
  
  const otherVideosContainer = document.getElementById("other-videos");
  otherVideosContainer.innerHTML = '<div class="loading-spinner"></div>';
  
  const otherVideos = [];
  for (let i = 0; i < nonShortVideos.length && otherVideos.length < 12; i++) {
    if (nonShortVideos[i].contentDetails.videoId !== currentNewestVideoId) {
      otherVideos.push(nonShortVideos[i]);
      console.log(`[Stats] Added to other videos: "${nonShortVideos[i].snippet.title}" (${nonShortVideos[i].duration} seconds)`);
    }
  }
  
  console.log(`[Stats] Final number of other videos to display: ${otherVideos.length}`);
  
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

/* -------------------- Navigation Functions -------------------- */
function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  
  navTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active class from all tabs
      navTabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Get the page from data attribute
      const page = tab.getAttribute('data-page');
      
      // Handle navigation
      if (page === 'portfolio') {
        window.location.href = 'portfolio.html';
      } else if (page === 'home') {
        window.location.href = 'index.html';
      }
    });
  });
}

/* -------------------- Portfolio Tab Functions -------------------- */
function initPortfolioTabs() {
  const portfolioTabs = document.querySelectorAll('.portfolio-tab');
  
  portfolioTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      portfolioTabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Hide all tab content
      const tabContents = document.querySelectorAll('.tab-content');
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Show the corresponding tab content
      const tabName = tab.getAttribute('data-tab');
      const targetContent = document.getElementById(`${tabName}-content`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

/* -------------------- Initialization -------------------- */
document.addEventListener("DOMContentLoaded", () => {
  if (typeof THREE !== "undefined") {
    new NebulaParticles();
  } else {
    console.error("Three.js not loaded!");
  }

  // Initialize navigation
  initNavigation();

  // Initialize portfolio tabs (if on portfolio page)
  initPortfolioTabs();

  // Initialize video loading (only on home page)
  const channelName = document.getElementById("channel-name");
  if (channelName) {
    channelName.textContent =
      `NEWEST VIDEO FROM ${CHANNEL_NAMES[currentChannelIndex].toUpperCase()}`;
    fetchChannelVideos(UPLOADS_PLAYLIST_IDS[currentChannelIndex]);

    document.getElementById("channel-btn-0").addEventListener("click", () => {
      selectChannel(0);
    });
    document.getElementById("channel-btn-1").addEventListener("click", () => {
      selectChannel(1);
    });
    document.getElementById("channel-btn-2").addEventListener("click", () => {
      selectChannel(2);
    });
  }

  const heartEl = document.getElementById("heart");
  if (heartEl) {
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
  }
});
