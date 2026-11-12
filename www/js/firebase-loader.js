// Memuat modul Firebase secara dinamis agar kegagalan mengakses CDN dapat ditangani UI.
(function () {
  import("./firebase-history.js").catch(function (error) {
    console.error("Modul Firebase gagal dimuat:", error);
    window.dispatchEvent(new CustomEvent("firebase:unavailable", { detail: { error: error } }));
  });
}());
