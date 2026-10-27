(function () {
  'use strict';

  const priceInput = document.getElementById('originalPrice');
  const discount1Input = document.getElementById('discount1');
  const discount2Input = document.getElementById('discount2');
  const inputs = [priceInput, discount1Input, discount2Input];
  let activeInput = priceInput;

  const view = {
    oldPrice: document.getElementById('oldPrice'),
    finalPrice: document.getElementById('finalPrice'),
    savingText: document.getElementById('savingText'),
    savingBadge: document.getElementById('savingBadge'),
    discountSummary: document.getElementById('discountSummary'),
    platformStatus: document.getElementById('platformStatus')
  };

  const percentFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

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
    updateSelectedPresets();

    // === PENAMBAHAN TIMER & SINYAL KE FIREBASE ===
    if (typeof window.ketikTimer !== 'undefined') {
      clearTimeout(window.ketikTimer); // Batalkan timer jika user masih mengetik
    }
    
    // Set timer baru selama 1.5 detik (1500 milidetik)
    window.ketikTimer = setTimeout(function() {
      // Pastikan ada input harga dan penghematan sebelum menyimpan
      if (hasPrice && saving > 0) {
        // Kirim sinyal ke firebase-history.js
        window.dispatchEvent(new CustomEvent('simpanDataKalkulator', {
          detail: { 
            hargaAwal: price, 
            diskon1: discount1, 
            diskon2: discount2, 
            hargaAkhir: finalPrice, 
            hemat: saving 
          }
        }));
      }
    }, 1500);
    // ==============================================
  }

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

  inputs.forEach(function (input) {
    input.addEventListener('focus', function () { setActiveField(input); });
    input.addEventListener('click', function () { setActiveField(input); });
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
        if (nextInput) nextInput.focus();
        else input.blur();
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