import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getAuth,
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

// 1. Hubungkan aplikasi ke konfigurasi Firebase
const config = window.KALKULATOR_FIREBASE_CONFIG;

if (!config) {
  throw new Error(
    "Konfigurasi Firebase tidak ditemukan. Periksa firebase-config.js."
  );
}

const app = getApps().length ? getApp() : initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. Login anonim untuk mendapatkan identitas pengguna
const userPromise = signInAnonymously(auth)
  .then(result => result.user);

// 3. Ambil elemen riwayat dari HTML
const historyButton = document.getElementById("historyButton");
const modal = document.getElementById("historyModal");
const closeButton = document.getElementById("closeHistoryButton");
const historyList = document.getElementById("historyList");
const historyStatus = document.getElementById("historyStatus");

if (!historyButton || !modal || !closeButton ||
    !historyList || !historyStatus) {
  console.error(
    "Elemen riwayat tidak ditemukan. Periksa index.html."
  );
}

// 4. Simpan hasil perhitungan ke Firestore
let saveTimer;
let lastSavedSignature = "";

window.scheduleHistorySave = function (data) {
  clearTimeout(saveTimer);

  if (!data || Number(data.originalPrice) <= 0) {
    return;
  }

  const signature = JSON.stringify({
    originalPrice: Number(data.originalPrice),
    discount1: Number(data.discount1),
    discount2: Number(data.discount2)
  });

  if (signature === lastSavedSignature) {
    return;
  }

  // Tunggu 1,5 detik setelah angka berhenti berubah
  saveTimer = setTimeout(async function () {
    try {
      const user = await userPromise;

      await addDoc(
        collection(
          db,
          "users",
          user.uid,
          "histories"
        ),
        {
          originalPrice: Number(data.originalPrice),
          discount1: Number(data.discount1),
          discount2: Number(data.discount2),
          finalPrice: Number(data.finalPrice),
          saving: Number(data.saving),
          savingPercent: Number(data.savingPercent),
          discountLabel: String(data.discountLabel || ""),
          createdAt: serverTimestamp()
        }
      );

      lastSavedSignature = signature;

      console.log("Riwayat berhasil disimpan ke Firestore.");
    } catch (error) {
      console.error("Gagal menyimpan riwayat:", error);
    }
  }, 1500);
};

// 5. Tampilkan riwayat saat ikon jam diklik
async function showHistory() {
  modal.hidden = false;
  historyList.replaceChildren();
  historyStatus.textContent = "Memuat riwayat...";

  try {
    const user = await userPromise;

    const historyQuery = query(
      collection(
        db,
        "users",
        user.uid,
        "histories"
      ),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const result = await getDocs(historyQuery);

    if (result.empty) {
      historyStatus.textContent =
        "Belum ada riwayat tersimpan.";
      return;
    }

    historyStatus.textContent =
      `Menampilkan ${result.size} riwayat terakhir.`;

    result.forEach(function (documentSnapshot) {
      const item = documentSnapshot.data();

      const card = document.createElement("div");
      card.className = "history-item";

      const finalPrice = document.createElement("strong");
      finalPrice.textContent =
        formatRupiah(item.finalPrice);

      const details = document.createElement("p");
      details.textContent =
        `Harga awal ${formatRupiah(item.originalPrice)} · ` +
        `Diskon ${item.discount1}% + ${item.discount2}%`;

      const saving = document.createElement("p");
      saving.textContent =
        `Penghematan ${formatRupiah(item.saving)}`;

      const date = document.createElement("p");
      date.textContent = item.createdAt
        ? item.createdAt.toDate().toLocaleString("id-ID")
        : "Waktu belum tersedia";

      card.append(finalPrice, details, saving, date);
      historyList.appendChild(card);
    });

  } catch (error) {
    console.error("Gagal mengambil riwayat:", error);

    historyStatus.textContent =
      "Riwayat gagal dimuat. Periksa koneksi dan pengaturan Firebase.";
  }
}

function formatRupiah(value) {
  return "Rp " +
    Math.round(Number(value) || 0).toLocaleString("id-ID");
}

// 6. Atur tombol buka dan tutup riwayat
historyButton?.addEventListener("click", showHistory);

closeButton?.addEventListener("click", function () {
  modal.hidden = true;
});

modal?.addEventListener("click", function (event) {
  if (event.target === modal) {
    modal.hidden = true;
  }
});

// ==============================================================================
// 7. MENANGKAP SINYAL DARI INDEX.JS & MENYIMPAN KE DATABASE
// ==============================================================================
window.addEventListener('simpanDataKalkulator', async (e) => {
  try {
    const user = await userPromise; 

    // Menyimpan data ke dalam koleksi khusus milik user anonim tersebut
    await addDoc(collection(db, "users", user.uid, "histories"), {
      originalPrice: e.detail.hargaAwal,
      discount1: e.detail.diskon1,
      discount2: e.detail.diskon2,
      finalPrice: e.detail.hargaAkhir,
      saving: e.detail.hemat,
      createdAt: serverTimestamp()
    });
    console.log("Berhasil menyimpan data riwayat otomatis ke Firebase!");
  } catch (error) {
    console.error("Gagal menyimpan ke Firebase:", error);
  }
});