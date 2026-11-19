// Pembuat HTML laporan riwayat perhitungan untuk dicetak atau disimpan sebagai PDF.
// Skrip biasa (bukan modul) agar bisa diuji terpisah dari Firebase.
// CSS ditulis di dalam HTML karena plugin cetak hanya menerima satu string HTML utuh.
(function () {
  "use strict";

  var BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function angka(value) {
    var n = Math.round(Number(value) || 0);
    var teks = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "-" : "") + teks;
  }

  function rupiah(value) { return "Rp " + angka(value); }

  function persen(value, desimal) {
    var faktor = desimal ? 10 : 1;
    var x = Math.round((Number(value) || 0) * faktor) / faktor;
    return String(x).replace(".", ",") + "%";
  }

  function dua(n) { return (n < 10 ? "0" : "") + n; }

  // Waktu memakai zona waktu perangkat; tidak diberi label zona agar tidak salah klaim.
  function waktu(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "-";
    return date.getDate() + " " + BULAN[date.getMonth()] + " " + date.getFullYear() +
      ", " + dua(date.getHours()) + ":" + dua(date.getMinutes());
  }

  function buatLaporanHTML(items, opsi) {
    items = Array.isArray(items) ? items : [];
    opsi = opsi || {};
    var namaToko = String(opsi.namaToko || "").trim() || "Kalkulator Diskon Toko";

    var totalAwal = 0, totalAkhir = 0, totalHemat = 0;
    var baris = items.map(function (it, i) {
      totalAwal += Number(it.hargaAwal) || 0;
      totalAkhir += Number(it.hargaAkhir) || 0;
      totalHemat += Number(it.totalHemat) || 0;
      return "<tr>" +
        "<td class=\"c\">" + (i + 1) + "</td>" +
        "<td>" + esc(waktu(it.createdAt)) + "</td>" +
        "<td class=\"r\">" + rupiah(it.hargaAwal) + "</td>" +
        "<td class=\"c\">" + persen(it.diskon1, false) + "</td>" +
        "<td class=\"c\">" + persen(it.diskon2, false) + "</td>" +
        "<td class=\"r\">" + rupiah(it.hargaSetelahDiskon1) + "</td>" +
        "<td class=\"r b\">" + rupiah(it.hargaAkhir) + "</td>" +
        "<td class=\"r\">" + rupiah(it.totalHemat) + "</td>" +
        "<td class=\"c\">" + persen(it.persenHemat, true) + "</td>" +
        "</tr>";
    }).join("");

    // Diskon efektif gabungan = total penghematan / total harga awal.
    // Bukan rata-rata persentase tiap baris, supaya harga besar tidak dianggap sama dengan harga kecil.
    var efektifGabungan = totalAwal > 0 ? (totalHemat / totalAwal) * 100 : 0;
    var idPerangkat = String(opsi.idPerangkat || "").trim();

    return "<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"utf-8\">" +
      "<title>Laporan Riwayat Perhitungan Diskon</title><style>" +
      "@page{size:A4 landscape;margin:12mm}" +
      "*{box-sizing:border-box}" +
      "body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;margin:0}" +
      "h1{font-size:15pt;margin:0 0 2px}" +
      "h2{font-size:11pt;font-weight:normal;margin:0 0 8px;color:#333}" +
      ".meta{font-size:9pt;color:#333;margin:0 0 10px;line-height:1.5}" +
      "table{width:100%;border-collapse:collapse}" +
      "thead{display:table-header-group}" +
      "tr{page-break-inside:avoid}" +
      "th,td{border:1px solid #999;padding:4px 6px;font-size:9pt}" +
      "th{background:#e8e8e8;text-align:center}" +
      ".r{text-align:right}.c{text-align:center}.b{font-weight:bold}" +
      ".ringkas{margin-top:12px;width:60%;page-break-inside:avoid}" +
      ".ringkas td:first-child{background:#f3f3f3;width:60%}" +
      ".catatan{margin-top:10px;font-size:8pt;color:#555;line-height:1.4}" +
      "</style></head><body>" +
      "<h1>" + esc(namaToko) + "</h1>" +
      "<h2>Laporan Riwayat Perhitungan Diskon</h2>" +
      "<p class=\"meta\">Dicetak: " + esc(waktu(opsi.waktuCetak instanceof Date ? opsi.waktuCetak : new Date())) +
      (idPerangkat ? " &nbsp;|&nbsp; ID perangkat: " + esc(idPerangkat) : "") +
      " &nbsp;|&nbsp; Cakupan: " + items.length + " perhitungan terakhir</p>" +
      "<table><thead><tr>" +
      "<th>No</th><th>Waktu</th><th>Harga awal</th><th>Diskon 1</th><th>Diskon 2</th>" +
      "<th>Setelah diskon 1</th><th>Harga akhir</th><th>Hemat (Rp)</th><th>Hemat (%)</th>" +
      "</tr></thead><tbody>" + baris + "</tbody></table>" +
      "<table class=\"ringkas\"><tbody>" +
      "<tr><td>Jumlah perhitungan</td><td class=\"r\">" + items.length + "</td></tr>" +
      "<tr><td>Total harga awal</td><td class=\"r\">" + rupiah(totalAwal) + "</td></tr>" +
      "<tr><td>Total harga akhir</td><td class=\"r b\">" + rupiah(totalAkhir) + "</td></tr>" +
      "<tr><td>Total penghematan</td><td class=\"r\">" + rupiah(totalHemat) + "</td></tr>" +
      "<tr><td>Diskon efektif gabungan</td><td class=\"r\">" + persen(efektifGabungan, true) + "</td></tr>" +
      "</tbody></table>" +
      "<p class=\"catatan\">Dibuat otomatis oleh aplikasi Kalkulator Diskon Toko dari riwayat perhitungan. " +
      "Angka dibulatkan ke rupiah. Laporan ini merangkum hasil perhitungan, bukan bukti transaksi penjualan.</p>" +
      "</body></html>";
  }

  window.buatLaporanHTML = buatLaporanHTML;
})();
