const BASE_URL = "http://127.0.0.1:8888"; // No trailing slash

document.addEventListener("DOMContentLoaded", () => {
  const METADATA_BASE_URL = `${BASE_URL}/metadata/`;
  const IMAGE_BASE_URL =
    "https://imgsrv-sxm-prod-device.streaming.siriusxm.com/";
  const PLAYLIST_URL = `${BASE_URL}/channels.m3u8`;
  const METADATA_POLL_RATE = 15000; // 15 sec
  const BROADCAST_DELAY_MS = 25000; // 25 sec

  const genreTabs = document.getElementById("genre-tabs");
  const channelContainer = document.getElementById("channel-container");
  const audioPlayer = document.getElementById("audio-player");
  const volumeSlider = document.getElementById("volume-slider");
  const playerLogo = document.getElementById("player-logo");
  const playerTitle = document.getElementById("player-title");
  const playerArtist = document.getElementById("player-artist");
  const channelTitle = document.getElementById("channel-title");
  const playPauseBtn = document.getElementById("play-pause-btn");
  const tabLeft = document.getElementById("tab-left");
  const tabRight = document.getElementById("tab-right");

  let hls;
  let metadataInterval = null;
  let currentChannel = null;
  let channelsByGenre = {};
  let currentGenre = null;

  // Play/Pause icons
  const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M8 5v14l11-7L8 5z"/></svg>`;
  const pauseIcon = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

  const handleImgError = (imgElement) => {
    imgElement.classList.add("img-error");
    imgElement.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  };

  // Parse M3U8 for channels
  const parseM3U8 = (data) => {
    const channels = [];
    const regex =
      /#EXTINF:-1.*?tvg-logo="([^"]*)".*?group-title="([^"]*)",([^\r\n]+)[\r\n]+\/listen\/([a-f0-9-]+)/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      channels.push({
        logo: match[1],
        genre: match[2] || "Miscellaneous",
        title: match[3].trim(),
        id: match[4].trim(),
      });
    }
    return channels;
  };

  // Update player UI with song or fallback to channel info
  const updatePlayerUI = (song, channel) => {
    if (song) {
      playerTitle.textContent = song.name;
      playerArtist.textContent = song.artistName;
      channelTitle.textContent = channel.title;

      playerLogo.classList.remove("img-error");
      const albumArtUrl = song.images?.tile?.aspect_1x1?.preferredImage?.url;
      if (albumArtUrl) {
        const albumB64Url = {
          key: albumArtUrl,
          edits: [{ format: { type: "jpeg" } }, { resize: { width: 300, height: 300 } }],
        };
        const jsonString = JSON.stringify(albumB64Url);
        const base64 = btoa(jsonString);

        playerLogo.src = `${IMAGE_BASE_URL}${base64}`;
      } else {
        playerLogo.src = channel.logo;
      }
      playerLogo.onerror = () => handleImgError(playerLogo);

      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.name || channel.title,
          artist: song.artistName || channel.genre,
          album: channel.title || "",
          artwork: [
            {
              src: albumArtUrl ? `${IMAGE_BASE_URL}${btoa(JSON.stringify({
                key: albumArtUrl,
                edits: [{ format: { type: "jpeg" } }, { resize: { width: 300, height: 300 } }],
              }))}` : channel.logo,
              sizes: "300x300",
              type: "image/jpeg",
            },
          ],
        });
      }
    } else {
      playerTitle.textContent = channel.title;
      playerArtist.textContent = channel.genre;
      channelTitle.textContent = channel.title;

      playerLogo.classList.remove("img-error");
      playerLogo.src = channel.logo;
      playerLogo.onerror = () => handleImgError(playerLogo);

      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: channel.title,
          artist: channel.genre,
          album: "",
          artwork: [
            {
              src: channel.logo,
              sizes: "300x300",
              type: "image/jpeg",
            },
          ],
        });
      }
    }
  };

  // Fetch metadata for current channel and update player UI
  const fetchAndDisplayMetadata = async () => {
    if (!currentChannel) return;

    try {
      const response = await fetch(`${METADATA_BASE_URL}${currentChannel.id}`);
      if (!response.ok) throw new Error(`API request failed: ${response.status}`);

      const data = await response.json();
      const items = data?.streams?.[0]?.metadata?.live?.items || [];
      const now = new Date(Date.now() - BROADCAST_DELAY_MS);

      const currentSong = items
        .filter((item) => item.cutFlags?.includes("SONG") && new Date(item.timestamp) <= now)
        .pop();

      updatePlayerUI(currentSong, currentChannel);
    } catch (error) {
      console.error("Failed to fetch metadata:", error);
      updatePlayerUI(null, currentChannel);
    }
  };

  // Play selected channel using HLS.js
  const playChannel = (channel) => {
    currentChannel = channel;

    const streamUrl = `${BASE_URL}/listen/${channel.id}`;

    if (hls) {
      hls.loadSource(streamUrl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => audioPlayer.play());
    } else {
      audioPlayer.src = streamUrl;
      audioPlayer.play();
    }

    clearInterval(metadataInterval);
    updatePlayerUI(null, currentChannel);
    fetchAndDisplayMetadata();

    metadataInterval = setInterval(fetchAndDisplayMetadata, METADATA_POLL_RATE);
  };

  // Render genre tabs with click listeners
  const renderGenreTabs = (genres) => {
    genreTabs.innerHTML = "";

    genres.forEach((genre) => {
      const btn = document.createElement("button");
      btn.className = "genre-tab";
      btn.textContent = genre;
      btn.addEventListener("click", () => {
        if (currentGenre === genre) return;
        currentGenre = genre;
        updateActiveTab();
        renderChannelsByGenre(genre);
      });
      genreTabs.appendChild(btn);
    });
  };

  // Update active tab styling
  const updateActiveTab = () => {
    [...genreTabs.children].forEach((btn) => {
      btn.classList.toggle("active", btn.textContent === currentGenre);
    });
  };

  // Render channels for the selected genre with scroll buttons
  const renderChannelsByGenre = (genre) => {
    channelContainer.innerHTML = "";

    const genreSection = document.createElement("div");
    genreSection.className = "genre-section";

    const genreTitle = document.createElement("h2");
    genreTitle.textContent = genre;
    genreSection.appendChild(genreTitle);

    const scrollWrapper = document.createElement("div");
    scrollWrapper.className = "channel-scroll-wrapper";

    const leftBtn = document.createElement("button");
    leftBtn.className = "channel-scroll-btn left";
    leftBtn.textContent = "◀";
    leftBtn.setAttribute("aria-label", `Scroll ${genre} channels left`);
    leftBtn.addEventListener("click", () => {
      channelGrid.scrollBy({ left: -200, behavior: "smooth" });
    });

    const rightBtn = document.createElement("button");
    rightBtn.className = "channel-scroll-btn right";
    rightBtn.textContent = "▶";
    rightBtn.setAttribute("aria-label", `Scroll ${genre} channels right`);
    rightBtn.addEventListener("click", () => {
      channelGrid.scrollBy({ left: 200, behavior: "smooth" });
    });

    const channelGrid = document.createElement("div");
    channelGrid.className = "channel-grid";

    channelsByGenre[genre].forEach((channel) => {
      const channelDiv = document.createElement("div");
      channelDiv.className = "channel-card";

      const img = document.createElement("img");
      img.src = channel.logo;
      img.alt = `${channel.title} logo`;
      img.onerror = () => handleImgError(img);

      const p = document.createElement("p");
      p.textContent = channel.title;

      channelDiv.append(img, p);
      channelDiv.addEventListener("click", () => playChannel(channel));
      channelGrid.appendChild(channelDiv);
    });

    scrollWrapper.append(leftBtn, channelGrid, rightBtn);
    genreSection.appendChild(scrollWrapper);
    channelContainer.appendChild(genreSection);
  };

  // Scroll genre tabs left/right buttons
  tabLeft.addEventListener("click", () => {
    genreTabs.scrollBy({ left: -150, behavior: "smooth" });
  });

  tabRight.addEventListener("click", () => {
    genreTabs.scrollBy({ left: 150, behavior: "smooth" });
  });

  volumeSlider.addEventListener("input", () => {
    audioPlayer.volume = parseFloat(volumeSlider.value);
  });

  // Setup HLS if supported
  if (Hls.isSupported()) {
    hls = new Hls();
    hls.attachMedia(audioPlayer);
  }

  // Play/pause toggle
  playPauseBtn.addEventListener("click", () => {
    if (!audioPlayer.src && !(hls && hls.url)) return;
    audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
  });

  audioPlayer.addEventListener("play", () => (playPauseBtn.innerHTML = pauseIcon));
  audioPlayer.addEventListener("pause", () => (playPauseBtn.innerHTML = playIcon));
  playPauseBtn.innerHTML = playIcon;

  // Fetch playlist and initialize UI
  fetch(PLAYLIST_URL)
    .then((response) =>
      response.ok ? response.text() : Promise.reject(response.status)
    )
    .then((data) => {
      const channels = parseM3U8(data);
      channelsByGenre = channels.reduce((acc, channel) => {
        (acc[channel.genre] = acc[channel.genre] || []).push(channel);
        return acc;
      }, {});
      const genres = Object.keys(channelsByGenre);

      renderGenreTabs(genres);

      // Select the first genre and render its channels
      if (genres.length > 0) {
        currentGenre = genres[0];
        updateActiveTab();
        renderChannelsByGenre(currentGenre);
      }
    })
    .catch((error) => {
      console.error("Failed to load playlist:", error);
      channelContainer.innerHTML = `<p class="error">Could not load channels. Make sure the local server is running.</p>`;
    });
});
