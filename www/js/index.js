(function () {
  'use strict';

  const priceInput = document.getElementById('originalPrice');
  const discount1Input = document.getElementById('discount1');
  const discount2Input = document.getElementById('discount2');
  const inputs = [priceInput, discount1Input, discount2Input];
  const appShell = document.querySelector('.app-shell');
  const visualViewport = window.visualViewport || null;
  let activeInput = priceInput;
  let expandedViewportHeight = Math.max(
    window.innerHeight || 0,
    visualViewport ? visualViewport.height : 0
  );
  let revealInputTimer = null;

  function currentVisibleHeight() {
    const heights = [window.innerHeight || 0];
    if (visualViewport && visualViewport.height) heights.push(visualViewport.height);
    return Math.max(240, Math.min.apply(null, heights.filter(Boolean)));
  }

  function revealFocusedInput() {
    window.clearTimeout(revealInputTimer);
    revealInputTimer = window.setTimeout(function () {
      const focusedInput = inputs.includes(document.activeElement) ? document.activeElement : null;
      if (!focusedInput || !appShell) return;

      const fieldContainer = focusedInput.closest('.input-container') || focusedInput;
      const rect = fieldContainer.getBoundingClientRect();
      const visibleTop = visualViewport ? visualViewport.offsetTop + 10 : 10;
      const visibleBottom = (visualViewport ? visualViewport.offsetTop + visualViewport.height : window.innerHeight) - 22;

      if (rect.bottom > visibleBottom) {
        appShell.scrollBy({ top: rect.bottom - visibleBottom + 14, behavior: 'auto' });
      } else if (rect.top < visibleTop) {
        appShell.scrollBy({ top: rect.top - visibleTop - 14, behavior: 'auto' });
      }
    }, 180);
  }

  function updateKeyboardLayout() {
    if (!appShell) return;

    const visibleHeight = currentVisibleHeight();
    const fieldIsFocused = inputs.includes(document.activeElement);
    if (!fieldIsFocused && visibleHeight > expandedViewportHeight - 60) {
      expandedViewportHeight = visibleHeight;
    }

    // Tetap anggap keyboard terbuka selama viewport masih menyusut,
    // meskipun input baru saja blur dan animasi keyboard belum selesai.
    const keyboardIsOpen = expandedViewportHeight - visibleHeight > 100;
    appShell.classList.toggle('keyboard-open', keyboardIsOpen);

    if (keyboardIsOpen) {
      appShell.style.setProperty('--app-visible-height', visibleHeight + 'px');
      revealFocusedInput();
    } else {
      appShell.style.removeProperty('--app-visible-height');
      if (!fieldIsFocused) expandedViewportHeight = visibleHeight;
    }
  }

  window.addEventListener('resize', updateKeyboardLayout, { passive: true });
  if (visualViewport) {
    visualViewport.addEventListener('resize', updateKeyboardLayout, { passive: true });
  }

  const view = {
    oldPrice: document.getElementById('oldPrice'),
    finalPrice: document.getElementById('finalPrice'),
    savingText: document.getElementById('savingText'),
    savingBadge: document.getElementById('savingBadge'),
    discountSummary: document.getElementById('discountSummary'),
    effectiveDiscountText: document.getElementById('effectiveDiscountText'),
    platformStatus: document.getElementById('platformStatus')
  };

  const percentFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  let latestCalculation = null;

  function setMessage(element, message, state) {
    if (!element) return;
    element.textContent = message;
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
  }

  function rawDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeDigits(value, input) {
    let digits = rawDigits(value);
    const isPercent = input === discount1Input || input === discount2Input;
    const maxLength = isPercent ? 3 : 15;
    digits = digits.slice(0, maxLength);
    digits = digits.replace(/^0+(?=\d)/, '');

    if (isPercent && digits !== '') {
      const numeric = Number(digits);
      if (numeric > 100) digits = '100';
    }
    return digits;
  }

  function formatDigits(digits, input) {
    if (input === priceInput && digits !== '') {
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    return digits;
  }

  function countDigitsBefore(value, position) {
    return rawDigits(value.slice(0, Math.max(0, position))).length;
  }

  function cursorPositionForDigitCount(value, count) {
    if (count <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (/\d/.test(value[i])) seen += 1;
      if (seen >= count) return i + 1;
    }
    return value.length;
  }

  function setInputDigits(input, digits, caretDigitCount) {
    const normalized = normalizeDigits(digits, input);
    input.value = formatDigits(normalized, input);
    activeInput = input;
    setActiveField(input);
    try {
      input.focus({ preventScroll: true });
      const caretDigits = Math.min(caretDigitCount, normalized.length);
      const caretPosition = cursorPositionForDigitCount(input.value, caretDigits);
      input.setSelectionRange(caretPosition, caretPosition);
    } catch (error) {
      // Some embedded WebViews do not support focus options; the value is still updated.
      input.focus();
    }
    calculate();
  }

  function formatRupiah(value) {
    return 'Rp ' + Math.round(value).toLocaleString('id-ID');
  }

  function readPrice() {
    const digits = rawDigits(priceInput.value);
    if (digits === '') return { hasPrice: false, value: 0 };
    const value = Number(digits);
    return { hasPrice: Number.isFinite(value) && value >= 0, value: Number.isFinite(value) ? value : 0 };
  }

  function readPercent(input) {
    const digits = rawDigits(input.value);
    if (digits === '') return 0;
    return Math.min(100, Math.max(0, Number(digits) || 0));
  }

  function setActiveField(input) {
    activeInput = input;
    const mapping = new Map([
      [priceInput, 'container-harga'],
      [discount1Input, 'container-diskon1'],
      [discount2Input, 'container-diskon2']
    ]);
    mapping.forEach(function (containerId, field) {
      const container = document.getElementById(containerId);
      container.classList.toggle('is-active', field === input);
    });
    updateSelectedPresets();
  }

  function getDiscountLabel(discount1, discount2) {
    if (discount1 > 0 && discount2 > 0) {
      return 'Diskon bertingkat ' + percentFormatter.format(discount1) + '% + ' + percentFormatter.format(discount2) + '%';
    }
    if (discount1 > 0) return 'Diskon ' + percentFormatter.format(discount1) + '%';
    if (discount2 > 0) return 'Diskon ekstra ' + percentFormatter.format(discount2) + '%';
    return 'Belum ada diskon';
  }

  function updateSelectedPresets() {
    const targetInput = activeInput === discount2Input ? discount2Input : discount1Input;
    const currentValue = rawDigits(targetInput.value);
    document.querySelectorAll('.preset').forEach(function (button) {
      const isSelected = currentValue !== '' && Number(currentValue) === Number(button.dataset.value);
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    });
  }

  function calculate() {
    const priceResult = readPrice();
    const price = priceResult.value;
    const hasPrice = priceResult.hasPrice;
    const discount1 = readPercent(discount1Input);
    const discount2 = readPercent(discount2Input);

    // Pembulatan dilakukan ke rupiah utuh pada tiap tahap diskon.
    const afterDiscount1 = Math.round(price * (1 - discount1 / 100));
    const finalPrice = Math.round(afterDiscount1 * (1 - discount2 / 100));
    const saving = Math.max(0, price - finalPrice);
    const savingPercent = price > 0 ? (saving / price) * 100 : 0;

    view.oldPrice.textContent = hasPrice ? formatRupiah(price) : 'Masukkan harga awal';
    view.finalPrice.textContent = hasPrice ? formatRupiah(finalPrice) : '—';
    view.savingText.textContent = hasPrice
      ? 'Hemat ' + formatRupiah(saving) + ' (' + percentFormatter.format(savingPercent) + '%)'
      : 'Isi harga untuk melihat penghematan';
    view.discountSummary.textContent = getDiscountLabel(discount1, discount2);
    view.savingBadge.classList.toggle('is-empty', !hasPrice || saving <= 0);

    if (view.effectiveDiscountText) {
      if (hasPrice && discount1 > 0 && discount2 > 0) {
        const combined = percentFormatter.format(discount1 + discount2);
        view.effectiveDiscountText.textContent =
          'Diskon ' + percentFormatter.format(discount1) + '% + ' +
          percentFormatter.format(discount2) + '% menghasilkan diskon efektif ' +
          percentFormatter.format(savingPercent) + '%, bukan ' + combined + '%.';
      } else if (hasPrice && (discount1 > 0 || discount2 > 0)) {
        view.effectiveDiscountText.textContent =
          'Diskon efektif ' + percentFormatter.format(savingPercent) + '%.';
      } else {
        view.effectiveDiscountText.textContent = 'Masukkan diskon untuk melihat persentase penghematan efektif.';
      }
    }

    latestCalculation = {
      hargaAwal: price,
      diskon1: discount1,
      diskon2: discount2,
      hargaSetelahDiskon1: afterDiscount1,
      hargaAkhir: finalPrice,
      totalHemat: saving,
      persenHemat: savingPercent,
      hasPrice: hasPrice
    };

    updateSelectedPresets();
  }

  // Firebase mengambil hasil terbaru hanya ketika pengguna menekan tombol Simpan.
  window.getKalkulatorCalculation = function () {
    return latestCalculation ? { ...latestCalculation } : null;
  };

  const saveHistoryButton = document.getElementById('saveHistoryButton');
  const saveHistoryStatus = document.getElementById('saveHistoryStatus');
  const historyButton = document.getElementById('historyButton');
  const historyModal = document.getElementById('historyModal');
  const historyStatus = document.getElementById('historyStatus');
  const closeHistoryButton = document.getElementById('closeHistoryButton');

  saveHistoryButton?.addEventListener('click', function () {
    const calculation = window.getKalkulatorCalculation();
    if (!calculation || !calculation.hasPrice || calculation.hargaAwal <= 0) {
      setMessage(saveHistoryStatus, 'Masukkan harga awal yang valid sebelum menyimpan.', 'error');
      return;
    }

    if (typeof window.simpanRiwayatPerhitungan !== 'function') {
      setMessage(saveHistoryStatus, 'Fitur riwayat belum siap. Periksa koneksi internet, lalu muat ulang aplikasi.', 'error');
      return;
    }

    window.simpanRiwayatPerhitungan(calculation);
  });

  historyButton?.addEventListener('click', function () {
    if (historyModal) historyModal.hidden = false;
    if (typeof window.bukaRiwayatPerhitungan === 'function') {
      window.bukaRiwayatPerhitungan();
    } else {
      setMessage(historyStatus, 'Riwayat tidak dapat dimuat. Pastikan internet aktif saat membuka aplikasi, lalu coba muat ulang.', 'error');
    }
  });

  closeHistoryButton?.addEventListener('click', function () {
    if (historyModal) historyModal.hidden = true;
  });

  historyModal?.addEventListener('click', function (event) {
    if (event.target === historyModal) historyModal.hidden = true;
  });

  window.addEventListener('firebase:unavailable', function () {
    setMessage(saveHistoryStatus, 'Modul riwayat Firebase tidak berhasil dimuat. Sambungkan internet dan muat ulang aplikasi.', 'error');
  });

  function handleTypedInput(input) {
    const originalValue = input.value;
    const caret = typeof input.selectionStart === 'number' ? input.selectionStart : originalValue.length;
    const digitsBeforeCaret = countDigitsBefore(originalValue, caret);
    const normalized = normalizeDigits(originalValue, input);
    input.value = formatDigits(normalized, input);
    const caretPosition = cursorPositionForDigitCount(input.value, Math.min(digitsBeforeCaret, normalized.length));
    try { input.setSelectionRange(caretPosition, caretPosition); } catch (error) { /* no-op */ }
    calculate();
  }

  // Kolom input dibuat readonly saat aplikasi pertama dibuka agar Android WebView
  // tidak langsung menampilkan keyboard. Ketukan pengguna akan mengaktifkannya.
  function clearStartupInputFocus() {
    if (inputs.includes(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  clearStartupInputFocus();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(function () {
      clearStartupInputFocus();
      updateKeyboardLayout();
    });
  } else {
    updateKeyboardLayout();
  }
  window.addEventListener('orientationchange', function () {
    window.setTimeout(function () {
      if (!inputs.includes(document.activeElement)) {
        expandedViewportHeight = Math.max(window.innerHeight || 0, visualViewport ? visualViewport.height : 0);
      }
      updateKeyboardLayout();
    }, 250);
  }, { passive: true });

  inputs.forEach(function (input) {
    input.addEventListener('pointerdown', function () {
      // Ambil tinggi viewport sebelum keyboard terbuka sebagai ukuran layar normal.
      if (!appShell.classList.contains('keyboard-open')) {
        expandedViewportHeight = currentVisibleHeight();
      }
      if (input.readOnly) {
        const wasFocused = document.activeElement === input;
        input.readOnly = false;
        // Jika WebView sempat memberi fokus awal pada kolom readonly,
        // blur lalu focus kembali dalam gestur pengguna agar keyboard muncul.
        if (wasFocused) {
          input.blur();
          input.focus();
        }
      }
    });
    input.addEventListener('click', function () {
      if (input.readOnly) {
        input.readOnly = false;
        input.focus();
      }
      setActiveField(input);
    });
    input.addEventListener('focus', function () {
      setActiveField(input);
      updateKeyboardLayout();
      revealFocusedInput();
    });
    input.addEventListener('blur', function () {
      window.setTimeout(updateKeyboardLayout, 120);
    });
    input.addEventListener('input', function () { handleTypedInput(input); });
    input.addEventListener('change', function () {
      const normalized = normalizeDigits(input.value, input);
      input.value = formatDigits(normalized, input);
      calculate();
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        const currentIndex = inputs.indexOf(input);
        const nextInput = inputs[currentIndex + 1];
        if (nextInput) {
          nextInput.readOnly = false;
          nextInput.focus();
        } else {
          input.blur();
        }
      }
    });
  });

  // Numpad layar tetap tersedia untuk sentuhan, tapi field asli juga bisa diketik.
  document.querySelectorAll('.numpad-btn').forEach(function (button) {
    button.addEventListener('pointerdown', function (event) {
      // Mencegah tombol merebut fokus dari kolom input saat disentuh/diklik.
      if (event.pointerType !== 'keyboard') event.preventDefault();
    });
    button.addEventListener('click', function () {
      const input = activeInput || priceInput;
      const action = button.dataset.action;
      const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
      const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
      const raw = rawDigits(input.value);
      const startCount = countDigitsBefore(input.value, start);
      const endCount = countDigitsBefore(input.value, end);

      if (action === 'clear') {
        setInputDigits(input, '', 0);
        return;
      }
      if (action === 'backspace') {
        if (startCount !== endCount) {
          const nextRaw = raw.slice(0, startCount) + raw.slice(endCount);
          setInputDigits(input, nextRaw, startCount);
        } else if (startCount > 0) {
          const nextRaw = raw.slice(0, startCount - 1) + raw.slice(startCount);
          setInputDigits(input, nextRaw, startCount - 1);
        }
        return;
      }
// penanganan tombol angka & tombol cepat diskon
      const key = button.dataset.key;
      if (/^\d$/.test(key)) {
        const nextRaw = raw.slice(0, startCount) + key + raw.slice(endCount);
        setInputDigits(input, nextRaw, startCount + 1);
      }
    });
  });

  document.querySelectorAll('.preset').forEach(function (button) {
    button.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'keyboard') event.preventDefault();
    });
    button.addEventListener('click', function () {
      const target = activeInput === discount2Input ? discount2Input : discount1Input;
      setInputDigits(target, button.dataset.value, String(button.dataset.value).length);
    });
  });

  // Menjaga status Cordova jika kalkulator dijalankan sebagai aplikasi Android.
  document.addEventListener('deviceready', function () {
    if (window.device && window.device.platform) {
      view.platformStatus.textContent = 'Kalkulator aktif · ' + window.device.platform;
    } else {
      view.platformStatus.textContent = 'Kalkulator aktif · Aplikasi Cordova';
    }
  }, false);

  // Format nilai contoh awal sesuai desain, tanpa membuka keyboard secara otomatis.
  priceInput.value = formatDigits(normalizeDigits(priceInput.value, priceInput), priceInput);
  discount1Input.value = normalizeDigits(discount1Input.value, discount1Input);
  discount2Input.value = normalizeDigits(discount2Input.value, discount2Input);
  setActiveField(priceInput);
  calculate();
}());