// Analisis dan pembuat laporan riwayat perhitungan diskon (PDF/cetak dan CSV).
// Skrip biasa (bukan modul) agar bisa diuji terpisah dari Firebase.
(function () {
  "use strict";

  var BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var RENTANG = [
    { n: "Di bawah Rp50.000", maks: 50000 },
    { n: "Rp50.000 sampai Rp199.999", maks: 200000 },
    { n: "Rp200.000 sampai Rp499.999", maks: 500000 },
    { n: "Rp500.000 ke atas", maks: Infinity }
  ];

  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function angka(v) {
    var n = Math.round(Number(v) || 0);
    return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function rupiah(v) { return "Rp " + angka(v); }
  function persen(v, desimal) {
    var f = desimal ? 10 : 1;
    return String(Math.round((Number(v) || 0) * f) / f).replace(".", ",") + "%";
  }
  function dua(n) { return (n < 10 ? "0" : "") + n; }
  function valid(d) { return d instanceof Date && !isNaN(d.getTime()); }
  function tgl(d) { return d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear(); }
  function kunciTgl(d) { return d.getFullYear() + "-" + dua(d.getMonth() + 1) + "-" + dua(d.getDate()); }
  // Waktu memakai zona waktu perangkat; tidak diberi label zona agar tidak salah klaim.
  function waktu(d) { return valid(d) ? tgl(d) + ", " + dua(d.getHours()) + ":" + dua(d.getMinutes()) : "-"; }

  // Semua ukuran dihitung dari riwayat perhitungan, bukan dari transaksi penjualan.
  function analisis(items, batas) {
    var a = { n: items.length, awal: 0, akhir: 0, hemat: 0, maks: 0, bocor: 0, lewat: 0, tanpaD2: 0,
      kombinasi: {}, hari: {}, jam: {}, perhatian: [],
      rentang: RENTANG.map(function (r) { return { n: r.n, maks: r.maks, jml: 0, awal: 0, hemat: 0 }; }),
      dari: null, sampai: null };
    var urut = items.slice().sort(function (x, y) {
      return (valid(x.createdAt) ? x.createdAt : 0) - (valid(y.createdAt) ? y.createdAt : 0);
    });
    urut.forEach(function (it, i) {
      var p0 = +it.hargaAwal || 0, d1 = +it.diskon1 || 0, d2 = +it.diskon2 || 0;
      var akhir = +it.hargaAkhir || 0, h = +it.totalHemat || 0, e = +it.persenHemat || 0, t = it.createdAt;
      a.awal += p0; a.akhir += akhir; a.hemat += h; a.maks = Math.max(a.maks, e);
      // Harga yang akan ditawarkan bila d1 dan d2 keliru dijumlahkan langsung.
      a.bocor += Math.max(0, akhir - Math.max(0, Math.round(p0 * (1 - (d1 + d2) / 100))));
      if (d2 === 0) a.tanpaD2++;

      var k = d1 + "|" + d2;
      var c = a.kombinasi[k] || (a.kombinasi[k] = { d1: d1, d2: d2, jml: 0, awal: 0, hemat: 0 });
      c.jml++; c.awal += p0; c.hemat += h;

      for (var r = 0; r < a.rentang.length; r++) {
        if (p0 < a.rentang[r].maks) { a.rentang[r].jml++; a.rentang[r].awal += p0; a.rentang[r].hemat += h; break; }
      }
      if (valid(t)) {
        if (!a.dari) a.dari = t;
        a.sampai = t;
        var hr = a.hari[kunciTgl(t)] || (a.hari[kunciTgl(t)] = { tgl: t, jml: 0, hemat: 0 });
        hr.jml++; hr.hemat += h;
        a.jam[t.getHours()] = (a.jam[t.getHours()] || 0) + 1;
      }
      var alasan = [], prev = urut[i - 1];
      if (batas > 0 && e > batas) { a.lewat++; alasan.push("Melewati batas " + batas + "%"); }
      if (prev && valid(t) && valid(prev.createdAt) && t - prev.createdAt < 60000 &&
          prev.hargaAwal === it.hargaAwal && prev.diskon1 === it.diskon1 && prev.diskon2 === it.diskon2) {
        alasan.push("Mungkin tersimpan ganda");
      }
      if (alasan.length) a.perhatian.push({ it: it, alasan: alasan.join("; ") });
    });
    a.daftarKombinasi = Object.keys(a.kombinasi).map(function (k) { return a.kombinasi[k]; })
      .sort(function (x, y) { return y.hemat - x.hemat; });
    return a;
  }

  function tabel(judul, kepala, baris, ket) {
    if (!baris.length) return "";
    return "<h3>" + esc(judul) + "</h3>" + (ket ? "<p class=\"ket\">" + esc(ket) + "</p>" : "") +
      "<table><thead><tr>" + kepala.map(function (k) { return "<th>" + esc(k[0]) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + baris.map(function (b) {
        return "<tr>" + b.map(function (c, i) { return "<td class=\"" + kepala[i][1] + "\">" + esc(c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  function temuan(a, batas) {
    var t = [], top = a.daftarKombinasi[0];
    if (top && a.hemat > 0) {
      t.push("Kombinasi " + top.d1 + "% + " + top.d2 + "% menyumbang " + persen(top.hemat / a.hemat * 100, true) +
        " dari total penghematan (" + rupiah(top.hemat) + ").");
    }
    if (a.bocor > 0) {
      t.push("Bila diskon bertingkat keliru dijumlahkan langsung, harga akhir terlalu rendah sebesar " +
        rupiah(a.bocor) + " pada periode ini.");
    }
    if (batas > 0) {
      t.push(a.lewat ? a.lewat + " perhitungan melewati batas diskon " + batas + "%."
                     : "Tidak ada perhitungan yang melewati batas diskon " + batas + "%.");
    }
    return t;
  }

  function buatLaporanHTML(items, opsi) {
    items = Array.isArray(items) ? items : [];
    opsi = opsi || {};
    var namaToko = String(opsi.namaToko || "").trim() || "Kalkulator Diskon Toko";
    var batas = Number(opsi.batasDiskon) || 0;
    var a = analisis(items, batas);
    var efektif = a.awal > 0 ? a.hemat / a.awal * 100 : 0;  // gabungan, bukan rata-rata persentase
    var periode = a.dari ? (tgl(a.dari) === tgl(a.sampai) ? tgl(a.dari) : tgl(a.dari) + " sampai " + tgl(a.sampai)) : "-";

    var ringkas = [
      ["Jumlah perhitungan", a.n], ["Total harga awal", rupiah(a.awal)], ["Total harga akhir", rupiah(a.akhir)],
      ["Total penghematan", rupiah(a.hemat)], ["Diskon efektif gabungan", persen(efektif, true)],
      ["Diskon efektif tertinggi", persen(a.maks, true)],
      ["Selisih bila diskon dijumlahkan langsung", rupiah(a.bocor)],
      ["Perhitungan tanpa diskon kedua", a.tanpaD2 + " dari " + a.n]
    ];
    if (batas > 0) ringkas.push(["Melewati batas diskon " + batas + "%", a.lewat]);

    var komb = a.daftarKombinasi.slice(0, 8).map(function (c) {
      return [c.d1 + "% + " + c.d2 + "%", c.jml, rupiah(c.awal / c.jml), rupiah(c.hemat), persen(c.awal ? c.hemat / c.awal * 100 : 0, true)];
    });
    var rent = a.rentang.filter(function (r) { return r.jml; }).map(function (r) {
      return [r.n, r.jml, rupiah(r.hemat), persen(r.awal ? r.hemat / r.awal * 100 : 0, true)];
    });
    var hari = Object.keys(a.hari).sort().reverse().slice(0, 14).map(function (k) {
      return [tgl(a.hari[k].tgl), a.hari[k].jml, rupiah(a.hari[k].hemat)];
    });
    var jam = Object.keys(a.jam).sort(function (x, y) { return a.jam[y] - a.jam[x]; }).slice(0, 5).map(function (j) {
      return [dua(+j) + ".00 sampai " + dua(+j) + ".59", a.jam[j]];
    });
    var perh = a.perhatian.slice(0, 15).map(function (p) {
      return [waktu(p.it.createdAt), rupiah(p.it.hargaAwal), persen(p.it.diskon1) + " + " + persen(p.it.diskon2),
        persen(p.it.persenHemat, true), p.alasan];
    });
    var rinci = items.map(function (it, i) {
      return [i + 1, waktu(it.createdAt), rupiah(it.hargaAwal), persen(it.diskon1), persen(it.diskon2),
        rupiah(it.hargaSetelahDiskon1), rupiah(it.hargaAkhir), rupiah(it.totalHemat), persen(it.persenHemat, true)];
    });
    var L = "l", R = "r", C = "c", poin = temuan(a, batas);

    return "<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"utf-8\"><title>Laporan Diskon</title><style>" +
      "@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}" +
      "body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;margin:0}" +
      "h1{font-size:15pt;margin:0 0 2px}h2{font-size:11pt;font-weight:normal;margin:0 0 8px;color:#333}" +
      "h3{font-size:11pt;margin:16px 0 4px;page-break-after:avoid}.ket{font-size:8.5pt;color:#555;margin:0 0 5px}" +
      ".meta{font-size:9pt;color:#333;margin:0 0 8px;line-height:1.5}ul{margin:4px 0 0;padding-left:18px;line-height:1.5}" +
      "table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}" +
      "th,td{border:1px solid #999;padding:4px 6px;font-size:9pt}th{background:#e8e8e8;text-align:center}" +
      ".r{text-align:right}.c{text-align:center}.l{text-align:left}.catatan{margin-top:12px;font-size:8pt;color:#555;line-height:1.4}" +
      "</style></head><body>" +
      "<h1>" + esc(namaToko) + "</h1><h2>Laporan Perhitungan Diskon</h2>" +
      "<p class=\"meta\">Dicetak: " + esc(waktu(opsi.waktuCetak instanceof Date ? opsi.waktuCetak : new Date())) +
      " &nbsp;|&nbsp; Periode data: " + esc(periode) + " &nbsp;|&nbsp; Cakupan: " + a.n + " perhitungan terakhir" +
      (opsi.idPerangkat ? " &nbsp;|&nbsp; ID perangkat: " + esc(opsi.idPerangkat) : "") + "</p>" +
      (poin.length ? "<h3>Temuan utama</h3><ul>" + poin.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") +
      tabel("1. Ringkasan periode", [["Ukuran", L], ["Nilai", R]], ringkas) +
      tabel("2. Per kombinasi diskon", [["Kombinasi", C], ["Jumlah", C], ["Rata-rata harga awal", R], ["Total hemat", R], ["Diskon efektif", C]], komb,
        "Diurutkan menurut total hemat. Maksimal 8 kombinasi.") +
      tabel("3. Per rentang harga awal", [["Rentang", L], ["Jumlah", C], ["Total hemat", R], ["Diskon efektif", C]], rent) +
      tabel("4a. Tren per hari", [["Tanggal", L], ["Jumlah", C], ["Total hemat", R]], hari, "Maksimal 14 hari terakhir yang ada datanya.") +
      tabel("4b. Jam tersibuk", [["Jam", L], ["Jumlah perhitungan", C]], jam) +
      tabel("5. Perlu diperiksa", [["Waktu", L], ["Harga awal", R], ["Diskon", C], ["Hemat", C], ["Alasan", L]], perh,
        "Maksimal 15 baris. Tanda tersimpan ganda adalah dugaan, bukan kepastian.") +
      tabel("6. Rincian perhitungan", [["No", C], ["Waktu", L], ["Harga awal", R], ["Diskon 1", C], ["Diskon 2", C],
        ["Setelah diskon 1", R], ["Harga akhir", R], ["Hemat (Rp)", R], ["Hemat (%)", C]], rinci) +
      "<p class=\"catatan\">Dibuat otomatis dari riwayat perhitungan di aplikasi Kalkulator Diskon Toko. Angka dibulatkan ke rupiah. " +
      "Laporan ini merangkum hasil perhitungan di kasir, bukan catatan penjualan: perhitungan yang tidak berujung pembelian juga tercatat.</p>" +
      "</body></html>";
  }

  // CSV untuk Excel berlokal Indonesia: pemisah titik koma, desimal koma, BOM UTF-8. Isinya angka saja.
  function buatCsv(items) {
    var kepala = ["Waktu", "Harga awal", "Diskon 1 (%)", "Diskon 2 (%)", "Harga setelah diskon 1", "Harga akhir", "Hemat (Rp)", "Hemat (%)"];
    var baris = (items || []).map(function (it) {
      var t = it.createdAt;
      return [valid(t) ? kunciTgl(t) + " " + dua(t.getHours()) + ":" + dua(t.getMinutes()) : "",
        Math.round(it.hargaAwal), it.diskon1, it.diskon2, Math.round(it.hargaSetelahDiskon1), Math.round(it.hargaAkhir),
        Math.round(it.totalHemat), String(Math.round((+it.persenHemat || 0) * 10) / 10).replace(".", ",")].join(";");
    });
    return "\uFEFF" + [kepala.join(";")].concat(baris).join("\r\n") + "\r\n";
  }

  window.buatLaporanHTML = buatLaporanHTML;
  window.buatCsvRiwayat = buatCsv;
  window.analisisRiwayat = analisis;
})();
