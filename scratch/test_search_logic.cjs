async function test() {
  const cRes = await fetch('http://localhost:5000/api/corbatines');
  const corbatines = await cRes.json();
  const vRes = await fetch('http://localhost:5000/api/vehiculos');
  const vehiculos = await vRes.json();

  console.log('=== Base de datos actual ===');
  console.log('Corbatines en BD:');
  corbatines.forEach(c => {
    console.log(`- ID_CORBATIN: ${c.id_corbatin} | NUMERO: ${c.numero} | QR_TOKEN: ${c.qr_token} | ID_VEHICULO: ${c.id_vehiculo} | VEHICULO: ${c.vehiculo?.marca} ${c.vehiculo?.modelo} (${c.vehiculo?.placas})`);
  });

  console.log('\nVehículos en BD:');
  vehiculos.forEach(v => {
    console.log(`- ID_VEHICULO: ${v.id_vehiculo} | PLACAS: ${v.placas} | MARCA: ${v.marca} ${v.modelo}`);
  });

  function extractSearchTokens(raw) {
    const clean = (raw || '').trim();
    const candidates = {
      numbers: [],
      tokens: [clean],
      plates: [clean],
    };

    if (!clean) return candidates;

    // 1. Formatos estructurados delimitados (ej. "LP-HOA|CORB:105|PLACAS:X|VIG:2026-2027", "CORB=105;PLACA=ABC", etc.)
    const delimiterPattern = /[|;,\n\r&]+/;
    if (delimiterPattern.test(clean)) {
      const segments = clean.split(delimiterPattern).map((s) => s.trim()).filter(Boolean);
      for (const seg of segments) {
        candidates.tokens.push(seg);
        if (seg.includes(':') || seg.includes('=')) {
          const [keyPart, ...valParts] = seg.split(/[:=]/);
          const key = keyPart.trim().toUpperCase();
          const val = valParts.join(':').trim();
          if (val) {
            candidates.tokens.push(val);
            // SOLO extraer corbatín para campos de corbatín/número (NO de vehículo)
            if (/^(?:CORB|CORBATIN|NUM|NUMERO|NO|TAG)$/i.test(key)) {
              const numVal = parseInt(val.replace(/\D/g, ''), 10);
              if (!isNaN(numVal) && numVal > 0) {
                candidates.numbers.push(numVal);
              }
            }
            if (/^(?:PLACA|PLACAS|PLATE|PLATES)$/i.test(key)) {
              if (val.toUpperCase() !== 'X' && val.toUpperCase() !== 'N/A' && val.toUpperCase() !== 'S/P' && val.toUpperCase() !== 'SIN') {
                candidates.plates.push(val);
                candidates.plates.push(val.replace(/[-_ ]/g, ''));
              }
            }
          }
        } else {
          const prefixMatch = seg.match(/^(?:C|CORB|CORBATIN|LP)[-_ ]*(?:20\d\d[-_ ]*)?0*(\d+)$/i);
          if (prefixMatch && prefixMatch[1]) {
            candidates.numbers.push(parseInt(prefixMatch[1], 10));
          } else if (/^\d+$/.test(seg)) {
            candidates.numbers.push(parseInt(seg, 10));
          }
        }
      }
    }

    // 2. Extracción directa con Expresiones Regulares para corbatín
    const corbMatches = clean.matchAll(/(?:CORB(?:ATIN)?|NUM(?:ERO)?|TAG|C)[-:_ #=]*(?:20\d\d[-_ ]*)?0*(\d+)/gi);
    for (const match of corbMatches) {
      if (match[1]) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > 0 && !(clean.includes('VIG') && (n === 2026 || n === 2027))) {
          candidates.numbers.push(n);
        }
      }
    }

    // Extracción de placas
    const plateMatches = clean.matchAll(/(?:PLACA(?:S)?|PLATE(?:S)?)[-:_ #=]*([A-Za-z0-9-]+)/gi);
    for (const match of plateMatches) {
      if (match[1] && match[1].toUpperCase() !== 'X' && match[1].toUpperCase() !== 'NA') {
        candidates.plates.push(match[1]);
        candidates.plates.push(match[1].replace(/[-_ ]/g, ''));
      }
    }

    // 3. JSON parse
    if ((clean.startsWith('{') && clean.endsWith('}')) || (clean.startsWith('[') && clean.endsWith(']'))) {
      try {
        const parsed = JSON.parse(clean);
        if (typeof parsed === 'object' && parsed !== null) {
          if (parsed.numero !== undefined) candidates.numbers.push(Number(parsed.numero));
          if (parsed.corbatin !== undefined) candidates.numbers.push(Number(parsed.corbatin));
          if (parsed.qr_token) candidates.tokens.push(String(parsed.qr_token));
          if (parsed.token) candidates.tokens.push(String(parsed.token));
          if (parsed.placas) candidates.plates.push(String(parsed.placas));
          if (parsed.placa) candidates.plates.push(String(parsed.placa));
        }
      } catch {}
    }

    // 4. URL parse
    if (clean.includes('http://') || clean.includes('https://') || clean.includes('?')) {
      try {
        const urlParts = clean.split('?');
        if (urlParts[1]) {
          const queryParams = new URLSearchParams(urlParts[1]);
          const num = queryParams.get('numero') || queryParams.get('corbatin') || queryParams.get('corb');
          if (num && !isNaN(Number(num))) candidates.numbers.push(Number(num));
          const tok = queryParams.get('token') || queryParams.get('qr');
          if (tok) candidates.tokens.push(tok);
          const pl = queryParams.get('placa') || queryParams.get('placas');
          if (pl) candidates.plates.push(pl);
        }
        const pathSegments = urlParts[0].split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment) {
          candidates.tokens.push(lastSegment);
          if (!isNaN(Number(lastSegment))) candidates.numbers.push(Number(lastSegment));
        }
      } catch {}
    }

    // 5. Número entero directo (ej: "105", "70", "4")
    if (/^\d+$/.test(clean)) {
      candidates.numbers.push(parseInt(clean, 10));
    }

    // 6. Formatos con prefijos como C-2026-070, C-2026-70, C-070, C-70, CORB-070, LP-70
    const prefixMatch = clean.match(/^(?:C|CORB|CORBATIN|LP)[-_ ]*(?:20\d\d[-_ ]*)?0*(\d+)$/i);
    if (prefixMatch && prefixMatch[1]) {
      candidates.numbers.push(parseInt(prefixMatch[1], 10));
    }

    // 7. Segmento numérico final separado por guiones
    const parts = clean.split(/[-_/ ]+/).filter(Boolean);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart) && lastPart !== '2026' && lastPart !== '2027') {
        candidates.numbers.push(parseInt(lastPart, 10));
      }
    }

    // 8. Extracción de dígitos eliminando años conocidos (solo si no es formato delimitado)
    if (!clean.includes('|')) {
      const digitsOnly = clean.replace(/\D/g, '');
      if (digitsOnly) {
        if (digitsOnly.startsWith('2026') && digitsOnly.length > 4) {
          candidates.numbers.push(parseInt(digitsOnly.slice(4), 10));
        } else if (digitsOnly.startsWith('2025') && digitsOnly.length > 4) {
          candidates.numbers.push(parseInt(digitsOnly.slice(4), 10));
        }
        candidates.numbers.push(parseInt(digitsOnly, 10));
      }
    }

    candidates.tokens.push(clean.replace(/[-_ ]/g, ''));
    candidates.plates.push(clean.replace(/[-_ ]/g, ''));

    candidates.numbers = Array.from(new Set(candidates.numbers.filter((n) => !isNaN(n) && n > 0 && !(clean.includes('VIG') && (n === 2026 || n === 2027)))));
    candidates.tokens = Array.from(new Set(candidates.tokens.filter(Boolean)));
    candidates.plates = Array.from(new Set(candidates.plates.filter(Boolean)));

    return candidates;
  }

  function buscar(input) {
    const { numbers, tokens, plates } = extractSearchTokens(input);

    // 1. Buscar corbatín coincidente prioritariamente por número de corbatín (c.numero) o token QR
    let matchedCorbatin = corbatines.find((c) => {
      const cNum = Number(c.numero);
      if (numbers.includes(cNum)) return true;

      if (c.qr_token) {
        const cQrUpper = String(c.qr_token).toUpperCase();
        const cQrClean = cQrUpper.replace(/[-_ ]/g, '');
        for (const tok of tokens) {
          const tUpper = tok.toUpperCase();
          const tClean = tUpper.replace(/[-_ ]/g, '');
          if (cQrUpper === tUpper || cQrClean === tClean) return true;
          if (tUpper.length >= 4 && !/^\d+$/.test(tUpper) && (cQrUpper.includes(tUpper) || tUpper.includes(cQrUpper))) return true;
        }
      }
      return false;
    });

    // 2. Si se encontró el corbatín, obtener el vehículo al que pertenece ese corbatín (c.id_vehiculo)
    let matchedVehiculo = null;
    if (matchedCorbatin) {
      matchedVehiculo =
        matchedCorbatin.vehiculo ||
        vehiculos.find((v) => Number(v.id_vehiculo) === Number(matchedCorbatin.id_vehiculo));
    } else {
      // 2.1 Si NO se encontró corbatín, buscar únicamente por PLACAS vehiculares (NUNCA por ID de vehículo)
      matchedVehiculo = vehiculos.find((v) => {
        const plateStr = String(v.placas || v.placa || '').toUpperCase();
        const plateClean = plateStr.replace(/[-_ ]/g, '');
        for (const pl of plates) {
          const pUpper = pl.toUpperCase();
          const pClean = pUpper.replace(/[-_ ]/g, '');
          if (plateClean.length >= 4 && (plateStr === pUpper || plateClean === pClean)) return true;
        }
        return false;
      });

      if (matchedVehiculo) {
        matchedCorbatin = corbatines.find((c) => Number(c.id_vehiculo) === Number(matchedVehiculo.id_vehiculo));
      }
    }

    return {
      input,
      tokensExtracted: { numbers, tokens, plates },
      encontrado: !!matchedVehiculo,
      corbatinNumero: matchedCorbatin?.numero,
      corbatinId: matchedCorbatin?.id_corbatin,
      vehiculoId: matchedVehiculo?.id_vehiculo,
      vehiculoMarca: matchedVehiculo ? `${matchedVehiculo.marca} ${matchedVehiculo.modelo}` : null,
      vehiculoPlacas: matchedVehiculo?.placas,
    };
  }

  console.log('\n=== Casos de Prueba ===');
  const testCases = [
    'LP-HOA|CORB:105|PLACAS:X|VIG:2026-2027',
    '105',
    'CORB-103-MTY-0000-A-2026',
    '103',
    '4',  // ID de vehiculo es 4, pero NO hay corbatin numero 4.
    'SON-1290-A', // Placas de vehículo con ID 2 y corbatín 102
    'C-2026-101',
    '101',
  ];

  testCases.forEach(tc => {
    const res = buscar(tc);
    console.log(`\nInput: "${tc}"`);
    console.log(`- Corbatin Numero: ${res.corbatinNumero}`);
    console.log(`- Vehiculo ID: ${res.vehiculoId} | ${res.vehiculoMarca} (${res.vehiculoPlacas})`);
    console.log(`- Encontrado: ${res.encontrado}`);
  });
}

test().catch(console.error);
