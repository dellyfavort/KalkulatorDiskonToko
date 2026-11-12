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

// Firestore Web SDK dapat menunggu respons server ketika perangkat offline.
// Batas ini hanya membatasi waktu tunggu UI; operasi Firestore tidak dibatalkan.
const FIRESTORE_OPERATION_TIMEOUT_MS = 10000;

// Login anonim pertama kali juga membutuhkan jaringan. Tanpa batas waktu, status "Menyimpan..."
// atau "Menghapus..." bisa menggantung jika proses masuk ke Firebase tidak pernah selesai.
const AUTH_TIMEOUT_MS = 10000;

if (!modal || !historyList || !historyStatus || !saveButton || !saveStatus) {
  throw new Error("Elemen riwayat atau tombol simpan tidak ditemukan. Periksa index.html.");
}

// Tunggu Firebase memulihkan sesi yang sudah ada. Jika belum ada, buat akun anonim.
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

  // Promise.race tidak membatalkan operasi yang sedang berjalan.
  // Pemanggil tetap harus menangani hasil akhir promise secara terpisah.
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

// authenticationPromise disimpan dan dipakai ulang oleh getAuthenticatedUser(), jadi proses masuk
// yang tertunda tidak diulang. Setelah batas waktu, pengguna boleh mencoba lagi dan akan
// memakai proses yang sama jika masih berjalan.
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
    // Permintaan ke Firestore belum dikirim, sehingga aman untuk mencoba lagi.
    return "Belum dapat terhubung ke Firebase setelah 10 detik. Data belum dikirim. Periksa koneksi internet lalu coba lagi.";
  }
  if (code === "app/operation-timeout") {
    if (action === "save") {
      return "Belum ada konfirmasi Firebase setelah 10 detik. Permintaan mungkin masih diproses. Jangan tekan Simpan lagi; periksa koneksi.";
    }
    if (action === "delete") {
      return "Belum ada konfirmasi Firebase setelah 10 detik. Permintaan hapus mungkin masih diproses. Jangan tekan Hapus lagi; periksa koneksi.";
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
  const item = snapshot.data();
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
  date.textContent = formatDate(item.createdAt);

  card.append(top, details, afterFirst, saving, date);
  return card;
}

async function loadHistory() {
  historyList.replaceChildren();
  setStatus(historyStatus, "Memuat riwayat...", "loading");

  const user = await getAuthenticatedUserWithTimeout();
  const historyQuery = query(
    collection(db, "users", user.uid, "history"),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  const result = await getDocs(historyQuery);

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
    const savePromise = addDoc(collection(db, "users", user.uid, "history"), {
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

      // Jangan aktifkan tombol lagi sebelum operasi asli selesai. Ini mencegah
      // pengguna mengirim addDoc kedua ketika permintaan pertama masih tertunda.
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
    const deletePromise = deleteDoc(doc(db, "users", user.uid, "history", historyId));

    try {
      await waitForFirestoreResponse(deletePromise);
    } catch (error) {
      if (error.code !== "app/operation-timeout") throw error;

      timedOut = true;
      setStatus(historyStatus, getFirebaseErrorMessage(error, "delete"), "error");

      // Tombol tetap nonaktif sampai permintaan asli mendapat respons agar
      // pengguna tidak mengirim ulang operasi yang statusnya belum diketahui.
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
