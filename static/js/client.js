document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const livePlayer = document.getElementById("livePlayer");
  const liveStatus = document.getElementById("live-status");
  const liveTitle = document.getElementById("live-title");
  const searchBox = document.getElementById("searchBox");
  const sortOptions = document.getElementById("sortOptions");
  const archiveList = document.getElementById("archive-list");
  const btnPlayLive = document.getElementById("btnPlayLive"); // Ambil tombol baru

  let mediaSource;
  let sourceBuffer;
  let audioQueue = [];

  // ... (fungsi setupLivePlayer, onSourceOpen, formatDuration tidak berubah) ...
  function setupLivePlayer() {
    if (!mediaSource || mediaSource.readyState === "closed") {
      try {
        mediaSource = new MediaSource();
        livePlayer.src = URL.createObjectURL(mediaSource);
        mediaSource.addEventListener("sourceopen", onSourceOpen);
        console.log("MediaSource setup untuk live player.");
      } catch (e) {
        console.error("MediaSource API tidak didukung.", e);
        liveStatus.innerHTML = "Browser tidak mendukung streaming langsung.";
      }
    }
  }

  function onSourceOpen() {
    if (sourceBuffer && mediaSource.sourceBuffers.length > 0) {
      try {
        mediaSource.removeSourceBuffer(sourceBuffer);
      } catch (e) {
        console.warn("Gagal menghapus SourceBuffer lama:", e);
      }
    }
    try {
      sourceBuffer = mediaSource.addSourceBuffer("audio/webm; codecs=opus");
      sourceBuffer.addEventListener("updateend", () => {
        if (audioQueue.length > 0 && !sourceBuffer.updating) {
          try {
            sourceBuffer.appendBuffer(audioQueue.shift());
          } catch (error) {
            console.error("Gagal menambahkan buffer ke antrian:", error);
          }
        }
      });
      if (audioQueue.length > 0) {
        sourceBuffer.appendBuffer(audioQueue.shift());
      }
    } catch (e) {
      console.error("Gagal menambahkan SourceBuffer:", e);
      liveStatus.innerHTML = "Error streaming langsung: codecs tidak didukung.";
    }
  }

  const formatDuration = (seconds) => {
    if (
      seconds === null ||
      seconds === undefined ||
      isNaN(seconds) ||
      seconds < 0
    ) {
      return "";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formatted = `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
    return `| Durasi: ${formatted}`;
  };

  const fetchAndRenderArchives = async () => {
    const query = searchBox.value;
    const sort = sortOptions.value;
    const response = await fetch(
      `/search?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`
    );
    const results = await response.json();
    archiveList.innerHTML = "";
    if (results.length > 0) {
      results.forEach((b) => {
        console.log("Data arsip diterima:", b);
        archiveList.innerHTML += `
                  <div class="archive-item">
                    <div class="archive-info">
                      <span class="title">${b.title}</span>
                      <span class="meta">
                        ${b.date} | ${b.start_time}
                        ${formatDuration(b.duration)}
                      </span>
                    </div>
                    <audio controls preload="none" src="/rekaman/${
                      b.filename
                    }"></audio>
                  </div>
                `;
      });
    } else {
      archiveList.innerHTML =
        '<p id="no-archives">Tidak ada rekaman ditemukan.</p>';
    }
  };

  socket.on("live_audio", (chunk) => {
    // ... (Fungsi ini tidak perlu diubah) ...
    if (!sourceBuffer) {
      console.warn("SourceBuffer belum siap untuk live_audio.");
      audioQueue.push(new Uint8Array(chunk).buffer);
      return;
    }
    const arrayBuffer = new Uint8Array(chunk).buffer;
    if (mediaSource.readyState === "open" && !sourceBuffer.updating) {
      try {
        sourceBuffer.appendBuffer(arrayBuffer);
      } catch (e) {
        audioQueue.push(arrayBuffer);
        console.error("Error appending buffer, queuing...:", e);
      }
    } else {
      audioQueue.push(arrayBuffer);
    }
  });

  // --- PERBAIKAN UTAMA UNTUK MOBILE ---
  socket.on("broadcast_started", (data) => {
    console.log("Sinyal 'broadcast_started' diterima:", data.title);
    liveStatus.innerHTML = 'Sedang berlangsung: <span id="live-title"></span>';
    document.getElementById("live-title").textContent = data.title;

    // Tampilkan audio player dan tombol play, jangan langsung memutar
    livePlayer.style.display = "block";
    livePlayer.controls = true; // Tampilkan kontrol bawaan audio player
    btnPlayLive.style.display = "block"; // Tampilkan tombol play manual kita

    setupLivePlayer();
  });

  // Tambahkan event listener untuk tombol play manual
  btnPlayLive.addEventListener("click", () => {
    livePlayer.play().catch((e) => console.error("Gagal memutar audio:", e));
    // Sembunyikan tombol setelah di-klik untuk antarmuka yang lebih bersih
    btnPlayLive.style.display = "none";
  });

  socket.on("broadcast_stopped", () => {
    // ... (Fungsi ini tidak perlu diubah, tapi kita pastikan tombol play juga disembunyikan) ...
    console.log("Sinyal 'broadcast_stopped' diterima.");
    liveStatus.textContent = "Tidak ada siaran langsung saat ini.";
    livePlayer.style.display = "none";
    livePlayer.src = "";
    btnPlayLive.style.display = "none"; // Sembunyikan tombol play saat siaran berhenti
    if (mediaSource && mediaSource.readyState === "open") {
      try {
        mediaSource.endOfStream();
      } catch (e) {
        console.warn("Gagal mengakhiri stream MediaSource:", e);
      }
    }
    mediaSource = null;
    sourceBuffer = null;
    audioQueue = [];

    setTimeout(fetchAndRenderArchives, 1000);
  });

  // ... (Sisa kode tidak berubah) ...
  searchBox.addEventListener("input", fetchAndRenderArchives);
  sortOptions.addEventListener("change", fetchAndRenderArchives);

  fetchAndRenderArchives();

  if (
    livePlayer.style.display !== "none" &&
    liveStatus.textContent.includes("Sedang berlangsung")
  ) {
    console.log(
      "Siaran live ditemukan saat memuat halaman. Menyiapkan live player."
    );
    // Tampilkan tombol play jika halaman di-refresh saat siaran berlangsung
    btnPlayLive.style.display = "block";
    livePlayer.controls = true;
    setupLivePlayer();
  }
});
