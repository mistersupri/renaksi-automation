import fs from "fs";
import XLSX from "xlsx";
import { chromium } from "playwright";
import { login } from "./login.js";
import { encodeParams } from "./encodeParams.js";

const tahun = 2026;
const triwulan = 1;
const limit = 100;

const OUTPUT_FILE = `evaluasi-kinerja-${tahun}-tw${triwulan}.xlsx`;

const getCsrfToken = async (page) => {
  return await page.locator('meta[name="csrf-token"]').getAttribute("content");
};

const getCookieHeader = async (context) => {
  const cookies = await context.cookies();

  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
};

const fetchRealisasiByNRK = async ({ page, csrfToken, cookieHeader, nrk }) => {
  const encoded = encodeParams(
    JSON.stringify({
      triwulan,
      nrk: String(nrk),
    }),
  );

  let currentPage = 1;
  let lastPage = 1;

  const results = [];

  do {
    const url =
      `https://etpp.jakarta.go.id/mankin/realisasi/${encoded}` +
      `/cari-target-output?tahun=${tahun}` +
      `&page=${currentPage}&limit=5`;

    console.log(`📥 Ambil realisasi NRK ${nrk} page ${currentPage}`);

    const response = await page.evaluate(
      async ({ url, csrfToken, cookieHeader }) => {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "X-CSRF-TOKEN": csrfToken,
            Cookie: cookieHeader,
            Accept: "application/json",
          },
          credentials: "include",
        });

        return await res.json();
      },
      {
        url,
        csrfToken,
        cookieHeader,
      },
    );

    results.push(...(response?.data || []));

    lastPage = response?.meta?.last_page || 1;
    currentPage++;
  } while (currentPage <= lastPage);

  return results;
};

const fetchAllPages = async ({ page, csrfToken, cookieHeader, endpoint }) => {
  let currentPage = 1;
  let lastPage = 1;

  const results = [];

  do {
    const url = `https://etpp.jakarta.go.id/mankin/${endpoint}/list?tahun=${tahun}&triwulan=${triwulan}&search=&page=${currentPage}&limit=${limit}`;

    console.log(`📥 ${endpoint} page ${currentPage}`);

    const response = await page.evaluate(
      async ({ url, csrfToken, cookieHeader }) => {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "X-CSRF-TOKEN": csrfToken,
            Cookie: cookieHeader,
            Accept: "application/json",
          },
          credentials: "include",
        });

        return await res.json();
      },
      {
        url,
        csrfToken,
        cookieHeader,
      },
    );

    results.push(...(response.data || []));

    lastPage = response?.meta?.last_page || 1;
    currentPage++;
  } while (currentPage <= lastPage);

  return results;
};

const exportToExcel = (rows) => {
  const workbook = XLSX.utils.book_new();

  const worksheet = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(workbook, worksheet, `TW${triwulan}-${tahun}`);

  XLSX.writeFile(workbook, OUTPUT_FILE);

  console.log(`✅ Excel berhasil dibuat: ${OUTPUT_FILE}`);
};

const exportRealisasiExcel = (rows) => {
  const workbook = XLSX.utils.book_new();

  const worksheet = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Realisasi");

  XLSX.writeFile(workbook, `realisasi-${tahun}-tw${triwulan}.xlsx`);

  console.log(`✅ File berhasil dibuat: realisasi-${tahun}-tw${triwulan}.xlsx`);
};

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  try {
    await login(page);

    await page.goto("https://etpp.jakarta.go.id/evaluasi-kinerja/bawahan", {
      waitUntil: "networkidle",
    });

    const csrfToken = await getCsrfToken(page);
    const cookieHeader = await getCookieHeader(page.context());

    console.log("✅ CSRF Token ditemukan");

    const bawahanLangsung = await fetchAllPages({
      page,
      csrfToken,
      cookieHeader,
      endpoint: "bawahan-langsung",
    });

    const bawahanTidakLangsung = await fetchAllPages({
      page,
      csrfToken,
      cookieHeader,
      endpoint: "bawahan-tidak-langsung",
    });

    console.log(
      `📊 Langsung: ${bawahanLangsung.length}, Tidak Langsung: ${bawahanTidakLangsung.length}`,
    );

    // gabungkan
    const merged = [...bawahanLangsung, ...bawahanTidakLangsung];

    // remove duplicate berdasarkan NRK
    const uniqueMap = new Map();

    for (const item of merged) {
      if (!uniqueMap.has(item.nrk)) {
        uniqueMap.set(item.nrk, item);
      }
    }

    const finalRows = [...uniqueMap.values()].map((item) => ({
      nrk: item.nrk,
      nama: item.nama,
      jabatan: item.jabatan,
      unit_kerja: item.unit_kerja,
      total_output: item.total_output,
      sudah_realisasi: item.sudah_realisasi,
      sudah_validasi: item.sudah_validasi,
      belum_validasi: item.belum_validasi,
      triwulan: item.triwulan,
      skp_id: item.skp_id,
    }));

    console.log(`📋 Total setelah deduplicate NRK: ${finalRows.length}`);

    exportToExcel(finalRows);

    const realisasiRows = [];

    for (const pegawai of finalRows) {
      try {
        const realisasiData = await fetchRealisasiByNRK({
          page,
          csrfToken,
          cookieHeader,
          nrk: pegawai.nrk,
        });

        console.log(
          `📊 ${pegawai.nama} (${pegawai.nrk}) => ${realisasiData.length} data`,
        );

        for (const realisasi of realisasiData) {
          realisasiRows.push({
            // pegawai
            nrk: pegawai.nrk,
            nama: pegawai.nama,
            jabatan: pegawai.jabatan,
            unit_kerja: pegawai.unit_kerja,

            // output
            i_id: realisasi.i_id,
            slug_path: realisasi.slug_path,
            triwulan: realisasi.tw,

            indikator: realisasi.indikator,
            renaksi: realisasi.renaksi,
            output: realisasi.output,
            kriteria: realisasi.kriteria,

            target: realisasi.target,
            realisasi: realisasi.realisasi,
            satuan: realisasi.satuan,

            nilai_validasi: realisasi.nilai_validasi,
            nilai_kualitas: realisasi.nilai_kualitas,
            nilai_capaian: realisasi.nilai_capaian,

            status: realisasi.status,

            keterangan_realisasi: realisasi.keterangan_realisasi,

            keterangan_validasi: realisasi.keterangan_validasi,

            perjanjian_kualitas: realisasi.perjanjian_kualitas,

            validator: realisasi.validator,
            validated_at: realisasi.validated_at,

            // lampiran utama
            has_lampiran: realisasi.has_lampiran,

            lampiran_count: realisasi.lampiran?.length || 0,

            lampiran_names: (realisasi.lampiran || [])
              .map((x) => x.name)
              .join("\n"),

            lampiran_files: (realisasi.lampiran || [])
              .map((x) => x.file)
              .join("\n"),

            // detail
            detail_i_id: realisasi.detail?.i_id || null,

            detail_target: realisasi.detail?.target || null,

            detail_realisasi: realisasi.detail?.realisasi || null,

            detail_nilai_validasi: realisasi.detail?.nilai_validasi || null,

            detail_nilai_capaian: realisasi.detail?.nilai_capaian || null,

            detail_keterangan_realisasi:
              realisasi.detail?.keterangan_realisasi || null,

            detail_keterangan_validasi:
              realisasi.detail?.keterangan_validasi || null,

            detail_has_lampiran: realisasi.detail?.has_lampiran || false,

            detail_lampiran_count: realisasi.detail?.lampiran?.length || 0,

            detail_lampiran_names: (realisasi.detail?.lampiran || [])
              .map((x) => x.name)
              .join("\n"),

            detail_lampiran_files: (realisasi.detail?.lampiran || [])
              .map((x) => x.file)
              .join("\n"),
          });
        }
      } catch (err) {
        console.error(`❌ Gagal ambil realisasi ${pegawai.nrk}`, err.message);
      }
    }

    exportRealisasiExcel(realisasiRows);
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await browser.close();
  }
})();
