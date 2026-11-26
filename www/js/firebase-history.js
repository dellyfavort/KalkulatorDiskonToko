import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const config = window.KALKULATOR_FIREBASE_CONFIG;
if (!config) {
  throw new Error("Konfigurasi Firebase tidak ditemukan. Periksa firebase-config.js.");
}

const app = getApps().length ? getApp() : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const modal = document.getElementById("historyModal");
const historyList = document.getElementById("historyList");
const historyStatus = document.getElementById("historyStatus");
const saveButton = document.getElementById("saveHistoryButton");
const saveStatus = document.getElementById("saveHistoryStatus");

const FIRESTORE_OPERATION_TIMEOUT_MS = 10000;
const AUTH_TIMEOUT_MS = 10000;

if (!modal || !historyList || !historyStatus || !saveButton || !saveStatus) {
  throw new Error("Elemen riwayat atau tombol simpan tidak ditemukan. Periksa index.html.");
}

let loadedHistory = [];
let loadedUid = "";

// Helper untuk menormalisasi data riwayat lama (originalPrice, dll.) dan baru (hargaAwal, dll.)
function normalizeHistoryItem(rawData, createdAtDate) {
  const hargaAwal = Number(rawData.hargaAwal !== undefined ? rawData.hargaAwal : rawData.originalPrice) || 0;
  const diskon1 = Number(rawData.diskon1 !== undefined ? rawData.diskon1 : rawData.discount1) || 0;
  const diskon2 = Number(rawData.diskon2 !== undefined ? rawData.diskon2 : rawData.discount2) || 0;

  const afterFirstCalc = Math.round(hargaAwal * (1 - diskon1 / 100));
  const hargaSetelahDiskon1 = Number(
    rawData.hargaSetelahDiskon1 !== undefined ? rawData.hargaSetelahDiskon1 : afterFirstCalc
  ) || 0;

  const hargaAkhir = Number(rawData.hargaAkhir !== undefined ? rawData.hargaAkhir : rawData.finalPrice) || 0;
  const totalHemat = Number(
    rawData.totalHemat !== undefined
      ? rawData.totalHemat
      : (rawData.saving !== undefined ? rawData.saving : Math.max(0, hargaAwal - hargaAkhir))
  ) || 0;

  const persenHemat = rawData.persenHemat !== undefined
    ? Number(rawData.persenHemat) || 0
    : (hargaAwal > 0 ? (totalHemat / hargaAwal) * 100 : 0);

  return {
    hargaAwal,
    diskon1,
    diskon2,
    hargaSetelahDiskon1,
    hargaAkhir,
    totalHemat,
    persenHemat,
    createdAt: createdAtDate
  };
}

let authenticationPromise = null;
function getAuthenticatedUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authenticationPromise) return authenticationPromise;

  authenticationPromise = new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
        return;
      }

      try {
        const credential = await signInAnonymously(auth);
        resolve(credential.user);
      } catch (error) {
        authenticationPromise = null;
        reject(error);
      }
    }, (error) => {
      unsubscribe();
      authenticationPromise = null;
      reject(error);
    });
  });

  return authenticationPromise;
}

function waitWithTimeout(promise, timeoutMs, errorCode, errorMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error(errorMessage);
      error.code = errorCode;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function waitForFirestoreResponse(operationPromise) {
  return waitWithTimeout(
    operationPromise,
    FIRESTORE_OPERATION_TIMEOUT_MS,
    "app/operation-timeout",
    "Firebase belum memberikan respons dalam 10 detik."
  );
}

function getAuthenticatedUserWithTimeout() {
  return waitWithTimeout(
    getAuthenticatedUser(),
    AUTH_TIMEOUT_MS,
    "app/auth-timeout",
    "Proses masuk ke Firebase belum selesai dalam 10 detik."
  );
}

function setStatus(element, message, state) {
  element.textContent = message;
  if (state) element.dataset.state = state;
  else delete element.dataset.state;
}

function getFirebaseErrorMessage(error, action) {
  const code = String(error && error.code ? error.code : "").toLowerCase();

  if (code === "auth/operation-not-allowed") {
    return "Login anonim belum aktif. Aktifkan Anonymous di Firebase Authentication.";
  }
  if (code === "auth/network-request-failed" || code === "unavailable" || code === "deadline-exceeded") {
    return "Tidak dapat terhubung ke Firebase. Periksa koneksi internet lalu coba lagi.";
  }
  if (code === "app/auth-timeout") {
    return "Belum dapat terhubung ke Firebase setelah 10 detik. Periksa koneksi internet lalu coba lagi.";
  }
  if (code === "app/operation-timeout") {
    if (action === "save") {
      return "Belum ada konfirmasi Firebase setelah 10 detik. Permintaan mungkin masih diproses.";
    }
    if (action === "delete") {
      return "Belum ada konfirmasi Firebase setelah 10 detik. Permintaan hapus mungkin masih diproses.";
    }
    return "Firebase belum memberikan respons setelah 10 detik. Periksa koneksi lalu coba lagi.";
  }
  if (code === "permission-denied") {
    return "Akses ditolak Firestore. Periksa Rules, UID, nama koleksi, dan skema data.";
  }
  if (code === "failed-precondition") {
    return "Permintaan belum dapat diproses. Periksa konfigurasi Firestore.";
  }
  if (action === "save") {
    return "Riwayat gagal disimpan. Periksa koneksi internet dan pengaturan Firebase.";
  }
  if (action === "delete") {
    return "Riwayat gagal dihapus. Periksa koneksi internet dan Firestore Rules.";
  }
  return "Riwayat gagal dimuat. Periksa koneksi internet dan pengaturan Firebase.";
}

function formatRupiah(value) {
  return "Rp " + Math.round(Number(value) || 0).toLocaleString("id-ID");
}

function formatPercent(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value) || 0) + "%";
}

function formatDate(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") return "Waktu belum tersedia";
  return timestamp.toDate().toLocaleString("id-ID");
}

function createHistoryCard(snapshot) {
  const rawData = snapshot.data();
  const item = normalizeHistoryItem(rawData, null);

  const card = document.createElement("article");
  card.className = "history-item";

  const top = document.createElement("div");
  top.className = "history-item-top";

  const finalPrice = document.createElement("strong");
  finalPrice.textContent = formatRupiah(item.hargaAkhir);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "history-delete-button";
  deleteButton.textContent = "Hapus";
  deleteButton.setAttribute("aria-label", "Hapus riwayat " + formatRupiah(item.hargaAkhir));
  deleteButton.addEventListener("click", () => deleteHistoryItem(snapshot.id, deleteButton));
  top.append(finalPrice, deleteButton);

  const details = document.createElement("p");
  details.textContent = "Harga awal " + formatRupiah(item.hargaAwal) + " · Diskon " +
    formatPercent(item.diskon1) + " + " + formatPercent(item.diskon2);

  const afterFirst = document.createElement("p");
  afterFirst.textContent = "Setelah diskon pertama " + formatRupiah(item.hargaSetelahDiskon1);

  const saving = document.createElement("p");
  saving.textContent = "Hemat " + formatRupiah(item.totalHemat) + " (" + formatPercent(item.persenHemat) + ")";

  const date = document.createElement("p");
  date.className = "history-date";
  date.textContent = formatDate(rawData.createdAt);

  card.append(top, details, afterFirst, saving, date);
  return card;
}

async function loadHistory() {
  historyList.replaceChildren();
  setStatus(historyStatus, "Memuat riwayat...", "loading");

  const user = await getAuthenticatedUserWithTimeout();
  const historyQuery = query(
    collection(db, "users", user.uid, "histories"),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  const result = await getDocs(historyQuery);

  loadedUid = user.uid;
  loadedHistory = result.docs.map((snapshot) => {
    const rawData = snapshot.data();
    const createdAtDate = rawData.createdAt && typeof rawData.createdAt.toDate === "function"
      ? rawData.createdAt.toDate()
      : null;
    return normalizeHistoryItem(rawData, createdAtDate);
  });

  if (result.empty) {
    setStatus(historyStatus, "Belum ada riwayat tersimpan.", "neutral");
    return 0;
  }

  result.forEach((snapshot) => {
    historyList.appendChild(createHistoryCard(snapshot));
  });
  setStatus(historyStatus, "Menampilkan " + result.size + " riwayat terakhir.", "success");
  return result.size;
}

window.bukaRiwayatPerhitungan = async function () {
  try {
    await loadHistory();
  } catch (error) {
    console.error("Gagal mengambil riwayat:", error);
    setStatus(historyStatus, getFirebaseErrorMessage(error, "read"), "error");
  }
};

function cetakDiIframe(html) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentWindow.document;
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  window.setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    window.setTimeout(() => iframe.remove(), 1000);
  }, 250);
}

// ===== Laporan dan ekspor =====
// Laporan membaca sampai REPORT_LIMIT dokumen, terpisah dari daftar riwayat yang tetap 30 terbaru.
const REPORT_LIMIT = 500;

function bacaPengaturan() {
  let namaToko = "", batasDiskon = 0;
  try {
    namaToko = window.localStorage.getItem("namaToko") || "";
    batasDiskon = Number(window.localStorage.getItem("batasDiskon")) || 0;
  } catch (error) { /* penyimpanan tidak tersedia: pakai bawaan */ }
  return { namaToko, batasDiskon };
}

function simpanPengaturan(namaToko, batasDiskon) {
  const nama = String(namaToko || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const batas = Math.min(100, Math.max(0, Math.round(Number(batasDiskon) || 0)));
  try {
    window.localStorage.setItem("namaToko", nama);
    window.localStorage.setItem("batasDiskon", String(batas));
  } catch (error) { /* abaikan */ }
  return { namaToko: nama, batasDiskon: batas };
}

async function muatDataLaporan() {
  const user = await getAuthenticatedUserWithTimeout();
  const snapshot = await waitForFirestoreResponse(getDocs(query(
    collection(db, "users", user.uid, "histories"),
    orderBy("createdAt", "desc"),
    limit(REPORT_LIMIT)
  )));
  loadedUid = user.uid;
  return snapshot.docs.map((docSnap) => {
    const raw = docSnap.data();
    const date = raw.createdAt && typeof raw.createdAt.toDate === "function" ? raw.createdAt.toDate() : null;
    return normalizeHistoryItem(raw, date);
  });
}

function namaBerkas(namaToko, ekstensi) {
  const toko = String(namaToko || "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  const d = new Date();
  const tanggal = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return (toko || "Laporan_Diskon") + "_" + tanggal + "." + ekstensi;
}

function bagikanCsv(nama, csv) {
  const sharing = window.plugins && window.plugins.socialsharing;
  if (sharing && typeof sharing.shareWithOptions === "function") {
    let biner = "";
    new TextEncoder().encode(csv).forEach((b) => { biner += String.fromCharCode(b); });
    sharing.shareWithOptions(
      { files: ["df:" + nama + ";data:text/csv;base64," + btoa(biner)], subject: nama, chooserTitle: "Simpan atau kirim laporan CSV" },
      () => setStatus(historyStatus, "Berkas CSV dibagikan.", "success"),
      () => setStatus(historyStatus, "Berbagi berkas dibatalkan.", "neutral")
    );
    return;
  }
  if (window.device && window.device.platform === "Android") {
    setStatus(historyStatus, "Plugin berbagi berkas belum terpasang di aplikasi ini.", "error");
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(historyStatus, "Berkas CSV diunduh.", "success");
}

async function siapkanLaporan() {
  const input = document.getElementById("shopNameInput");
  const batasInput = document.getElementById("discountLimitInput");
  const pengaturan = simpanPengaturan(input ? input.value : bacaPengaturan().namaToko,
    batasInput ? batasInput.value : bacaPengaturan().batasDiskon);
  setStatus(historyStatus, "Menyiapkan data laporan...", "loading");
  try {
    const items = await muatDataLaporan();
    if (!items.length) {
      setStatus(historyStatus, "Belum ada riwayat untuk diekspor.", "error");
      return null;
    }
    return { items, pengaturan };
  } catch (error) {
    console.error("Gagal memuat data laporan:", error);
    setStatus(historyStatus, getFirebaseErrorMessage(error, "read"), "error");
    return null;
  }
}

window.eksporRiwayatPDF = async function () {
  if (typeof window.buatLaporanHTML !== "function") {
    setStatus(historyStatus, "Modul laporan belum dimuat. Muat ulang aplikasi.", "error");
    return;
  }
  const data = await siapkanLaporan();
  if (!data) return;

  const html = window.buatLaporanHTML(data.items, {
    namaToko: data.pengaturan.namaToko,
    batasDiskon: data.pengaturan.batasDiskon,
    idPerangkat: loadedUid.slice(-6),
    waktuCetak: new Date()
  });

  const printer = window.cordova && window.cordova.plugins && window.cordova.plugins.printer;
  if (printer && typeof printer.print === "function") {
    setStatus(historyStatus, "Membuka dialog cetak. Pilih 'Simpan sebagai PDF' untuk menyimpan laporan.", "loading");
    printer.print(html, { name: namaBerkas(data.pengaturan.namaToko, "pdf").replace(/\.pdf$/, ""), landscape: true }, (selesai) => {
      setStatus(historyStatus, selesai ? "Laporan dikirim ke dialog cetak." : "Cetak dibatalkan.", selesai ? "success" : "neutral");
    });
    return;
  }
  if (window.device && window.device.platform === "Android") {
    setStatus(historyStatus, "Plugin cetak belum terpasang di aplikasi ini.", "error");
    return;
  }
  cetakDiIframe(html);
  setStatus(historyStatus, "Dialog cetak dibuka.", "success");
};

window.eksporRiwayatCSV = async function () {
  if (typeof window.buatCsvRiwayat !== "function") {
    setStatus(historyStatus, "Modul laporan belum dimuat. Muat ulang aplikasi.", "error");
    return;
  }
  const data = await siapkanLaporan();
  if (!data) return;
  bagikanCsv(namaBerkas(data.pengaturan.namaToko, "csv"), window.buatCsvRiwayat(data.items));
};

(function isiPengaturanAwal() {
  const pengaturan = bacaPengaturan();
  const input = document.getElementById("shopNameInput");
  const batasInput = document.getElementById("discountLimitInput");
  if (input) input.value = pengaturan.namaToko;
  if (batasInput) batasInput.value = pengaturan.batasDiskon || "";
})();

// Fitur Hapus Semua Riwayat Sekaligus dari koleksi 'histories'
window.hapusSemuaRiwayat = async function () {
  if (!window.confirm("Yakin ingin menghapus SELURUH riwayat perhitungan? Tindakan ini tidak dapat dibatalkan.")) return;

  setStatus(historyStatus, "Menghapus semua riwayat...", "loading");
  try {
    const user = await getAuthenticatedUserWithTimeout();
    const historyQuery = query(collection(db, "users", user.uid, "histories"));
    const snapshot = await getDocs(historyQuery);

    if (snapshot.empty) {
      setStatus(historyStatus, "Tidak ada riwayat untuk dihapus.", "neutral");
      return;
    }

    const deletePromises = snapshot.docs.map((documentSnap) =>
      deleteDoc(doc(db, "users", user.uid, "histories", documentSnap.id))
    );

    await Promise.all(deletePromises);
    await loadHistory();
    setStatus(historyStatus, "Semua riwayat berhasil dihapus.", "success");
  } catch (error) {
    console.error("Gagal menghapus semua riwayat:", error);
    setStatus(historyStatus, "Gagal menghapus seluruh riwayat. Periksa koneksi Anda.", "error");
  }
};

window.simpanRiwayatPerhitungan = async function (calculation) {
  if (saveButton.disabled) return;

  if (!calculation || !Number.isFinite(Number(calculation.hargaAwal)) || Number(calculation.hargaAwal) <= 0) {
    setStatus(saveStatus, "Masukkan harga awal yang valid sebelum menyimpan.", "error");
    return;
  }

  saveButton.disabled = true;
  setStatus(saveStatus, "Menyimpan perhitungan ke Firebase...", "loading");

  let timedOut = false;
  try {
    const user = await getAuthenticatedUserWithTimeout();
    const savePromise = addDoc(collection(db, "users", user.uid, "histories"), {
      hargaAwal: Number(calculation.hargaAwal),
      diskon1: Number(calculation.diskon1),
      diskon2: Number(calculation.diskon2),
      hargaSetelahDiskon1: Number(calculation.hargaSetelahDiskon1),
      hargaAkhir: Number(calculation.hargaAkhir),
      totalHemat: Number(calculation.totalHemat),
      persenHemat: Number(calculation.persenHemat),
      createdAt: serverTimestamp()
    });

    try {
      await waitForFirestoreResponse(savePromise);
    } catch (error) {
      if (error.code !== "app/operation-timeout") throw error;

      timedOut = true;
      setStatus(saveStatus, getFirebaseErrorMessage(error, "save"), "error");

      savePromise.then(async () => {
        setStatus(saveStatus, "Perhitungan berhasil disimpan ke riwayat.", "success");
        if (!modal.hidden) {
          try {
            await loadHistory();
          } catch (refreshError) {
            console.error("Data tersimpan, tetapi daftar riwayat gagal diperbarui:", refreshError);
            setStatus(historyStatus, "Data tersimpan, tetapi daftar riwayat gagal diperbarui. Buka kembali riwayat.", "error");
          }
        }
      }).catch((lateError) => {
        console.error("Penyimpanan tertunda akhirnya gagal:", lateError);
        setStatus(saveStatus, getFirebaseErrorMessage(lateError, "save"), "error");
      }).finally(() => {
        saveButton.disabled = false;
      });
      return;
    }

    setStatus(saveStatus, "Perhitungan berhasil disimpan ke riwayat.", "success");

    if (!modal.hidden) {
      try {
        await loadHistory();
      } catch (refreshError) {
        console.error("Data tersimpan, tetapi daftar riwayat gagal diperbarui:", refreshError);
        setStatus(historyStatus, "Data tersimpan, tetapi daftar riwayat gagal diperbarui. Buka kembali riwayat.", "error");
      }
    }
  } catch (error) {
    console.error("Gagal menyimpan riwayat:", error);
    setStatus(saveStatus, getFirebaseErrorMessage(error, "save"), "error");
  } finally {
    if (!timedOut) saveButton.disabled = false;
  }
};

async function deleteHistoryItem(historyId, button) {
  if (!window.confirm("Hapus riwayat perhitungan ini? Data yang dihapus tidak dapat dipulihkan.")) return;

  button.disabled = true;
  setStatus(historyStatus, "Menghapus riwayat...", "loading");

  let timedOut = false;
  try {
    const user = await getAuthenticatedUserWithTimeout();
    const deletePromise = deleteDoc(doc(db, "users", user.uid, "histories", historyId));

    try {
      await waitForFirestoreResponse(deletePromise);
    } catch (error) {
      if (error.code !== "app/operation-timeout") throw error;

      timedOut = true;
      setStatus(historyStatus, getFirebaseErrorMessage(error, "delete"), "error");

      deletePromise.then(async () => {
        try {
          const remaining = await loadHistory();
          if (remaining === 0) {
            setStatus(historyStatus, "Riwayat berhasil dihapus. Belum ada riwayat tersimpan.", "success");
          } else {
            setStatus(historyStatus, "Riwayat berhasil dihapus. Menampilkan " + remaining + " riwayat.", "success");
          }
        } catch (refreshError) {
          console.error("Riwayat sudah dihapus, tetapi daftar gagal diperbarui:", refreshError);
          setStatus(historyStatus, "Riwayat sudah dihapus, tetapi daftar gagal diperbarui. Tutup lalu buka kembali riwayat.", "error");
        }
      }).catch((lateError) => {
        console.error("Penghapusan tertunda akhirnya gagal:", lateError);
        setStatus(historyStatus, getFirebaseErrorMessage(lateError, "delete"), "error");
        button.disabled = false;
      });
      return;
    }

    try {
      const remaining = await loadHistory();
      if (remaining === 0) {
        setStatus(historyStatus, "Riwayat berhasil dihapus. Belum ada riwayat tersimpan.", "success");
      } else {
        setStatus(historyStatus, "Riwayat berhasil dihapus. Menampilkan " + remaining + " riwayat.", "success");
      }
    } catch (refreshError) {
      console.error("Riwayat sudah dihapus, tetapi daftar gagal diperbarui:", refreshError);
      setStatus(historyStatus, "Riwayat sudah dihapus, tetapi daftar gagal diperbarui. Tutup lalu buka kembali riwayat.", "error");
    }
  } catch (error) {
    console.error("Gagal menghapus riwayat:", error);
    setStatus(historyStatus, getFirebaseErrorMessage(error, "delete"), "error");
    button.disabled = false;
  } finally {
    if (!timedOut) button.disabled = false;
  }
}