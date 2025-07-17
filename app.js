const BASE_URL = "REPLACE_THIS_WITH_BASE_URL"

document.addEventListener('DOMContentLoaded', () => {
    const METADATA_BASE_URL = `${BASE_URL}/metadata/`;
    const IMAGE_BASE_URL = 'https://imgsrv-sxm-prod-device.streaming.siriusxm.com/';
    const PLAYLIST_URL = `${BASE_URL}/channels.m3u8`;
    const METADATA_POLL_RATE = 15000; // 15 seconds
    const BROADCAST_DELAY_MS = 25000; // 25 seconds

    const channelContainer = document.getElementById('channel-container');
    const audioPlayer = document.getElementById('audio-player');
    const playerLogo = document.getElementById('player-logo');
    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');
    const channelTitle = document.getElementById('channel-title');
    const playPauseBtn = document.getElementById('play-pause-btn');

    let hls;
    let metadataInterval = null;
    let currentChannel = null;

    const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M8 5v14l11-7L8 5z"/></svg>`;
    const pauseIcon = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;


    const handleImgError = (imgElement) => {
        imgElement.classList.add('img-error');
        imgElement.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    };

    const parseM3U8 = (data) => {
        const channels = [];
        const regex = /#EXTINF:-1.*?tvg-logo="([^"]*)".*?group-title="([^"]*)",([^\r\n]+)[\r\n]+\/listen\/([a-f0-9-]+)/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
            channels.push({
                logo: match[1],
                genre: match[2] || 'Miscellaneous',
                title: match[3].trim(),
                id: match[4].trim()
            });
        }
        return channels;
    };


    const updatePlayerUI = (song, channel) => {
        if (song) {
            playerTitle.textContent = song.name;
            playerArtist.textContent = song.artistName;
            channelTitle.textContent = channel.title;

            playerLogo.classList.remove('img-error');
            const albumArtUrl = song.images?.tile?.aspect_1x1?.preferredImage?.url;
            const albumB64Url = {"key":albumArtUrl,"edits":[{"format":{"type":"jpeg"}},{"resize":{"width":300,"height":300}}]}
            const jsonString = JSON.stringify(albumB64Url);
            const base64 = btoa(jsonString);

            playerLogo.src = albumArtUrl ? `${IMAGE_BASE_URL}${base64}` : channel.logo;
            playerLogo.onerror = () => handleImgError(playerLogo);
        } else {
            playerTitle.textContent = channel.title;
            playerArtist.textContent = channel.genre;
            channelTitle.textContent = channel.title;

            playerLogo.classList.remove('img-error');
            playerLogo.src = channel.logo;
            playerLogo.onerror = () => handleImgError(playerLogo);
        }
    };

    const fetchAndDisplayMetadata = async () => {
        if (!currentChannel) return;

        try {
            const response = await fetch(`${METADATA_BASE_URL}${currentChannel.id}`, {
                method: 'GET'
            });
            if (!response.ok) throw new Error(`API request failed: ${response.status}`);

            const data = await response.json();
            const items = data?.streams?.[0]?.metadata?.live?.items || [];

            const now = new Date(Date.now() - BROADCAST_DELAY_MS);

            const currentSong = items
                .filter(item => item.cutFlags?.includes('SONG') && new Date(item.timestamp) <= now)
                .pop();

            updatePlayerUI(currentSong, currentChannel);

        } catch (error) {
            console.error('Failed to fetch metadata:', error);
            updatePlayerUI(null, currentChannel);
        }
    };

    const playChannel = (channel) => {
        currentChannel = channel;
        const streamUrl = `${BASE_URL}/listen/${channel.id}`;

        if (hls) {
            hls.loadSource(streamUrl);
            hls.on(Hls.Events.MANIFEST_PARSED, () => audioPlayer.play());
        }

        clearInterval(metadataInterval);

        updatePlayerUI(null, currentChannel);
        fetchAndDisplayMetadata();

        metadataInterval = setInterval(fetchAndDisplayMetadata, METADATA_POLL_RATE);
    };


    if (Hls.isSupported()) {
        hls = new Hls();
        hls.attachMedia(audioPlayer);
    }

    const renderChannels = (channels) => {
        const channelsByGenre = channels.reduce((acc, channel) => {
            (acc[channel.genre] = acc[channel.genre] || []).push(channel);
            return acc;
        }, {});

        channelContainer.innerHTML = '';

        for (const genre in channelsByGenre) {
            const genreSection = document.createElement('div');
            genreSection.className = 'genre-section';

            const genreTitle = document.createElement('h2');
            genreTitle.textContent = genre;
            genreSection.appendChild(genreTitle);

            const channelGrid = document.createElement('div');
            channelGrid.className = 'channel-grid';

            channelsByGenre[genre].forEach(channel => {
                const channelDiv = document.createElement('div');
                channelDiv.className = 'channel-card';

                const img = document.createElement('img');
                img.src = channel.logo;
                img.alt = `${channel.title} logo`;
                img.onerror = () => handleImgError(img);

                const p = document.createElement('p');
                p.textContent = channel.title;

                channelDiv.append(img, p);
                channelDiv.addEventListener('click', () => playChannel(channel));
                channelGrid.appendChild(channelDiv);
            });

            genreSection.appendChild(channelGrid);
            channelContainer.appendChild(genreSection);
        }
    };

    fetch(PLAYLIST_URL)
        .then(response => response.ok ? response.text() : Promise.reject(response.status))
        .then(data => renderChannels(parseM3U8(data)))
        .catch(error => {
            console.error('Failed to load playlist:', error);
            channelContainer.innerHTML = `<p class="error">Could not load channels. Make sure the local server is running.</p>`;
        });

    playPauseBtn.addEventListener('click', () => {
        if (!audioPlayer.src && !hls.url) return;
        audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
    });

    audioPlayer.addEventListener('play', () => playPauseBtn.innerHTML = pauseIcon);
    audioPlayer.addEventListener('pause', () => playPauseBtn.innerHTML = playIcon);
    playPauseBtn.innerHTML = playIcon;
});