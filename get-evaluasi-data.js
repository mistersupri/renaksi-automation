import fs from "fs";
import axios from "axios";
import * as XLSX from "xlsx";
import { chromium } from "playwright";
import { login } from "./login.js";

const tahun = 2026;
const triwulan = 1;

const SUMMARY_FILE = `evaluasi-kinerja-summary-${tahun}-TW${triwulan}.xlsx`;
const DETAIL_FILE = `evaluasi-kinerja-detail-${tahun}-TW${triwulan}.xlsx`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ENDPOINTS = [
  {
    tipe: "Bawahan Langsung",
    url: "https://etpp.jakarta.go.id/evaluasi-kinerja/search-get-evaluasi-bawahan-langsung",
  },
  {
    tipe: "Bawahan Tidak Langsung",
    url: "https://etpp.jakarta.go.id/evaluasi-kinerja/search-get-evaluasi-bawahan-tidak-langsung",
  },
];

function getTahunBulan(tahun, triwulan) {
  const bulanMap = {
    1: "03",
    2: "06",
    3: "09",
    4: "12",
  };

  return `${tahun}${bulanMap[triwulan]}`;
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  await login(page);

  await page.goto("https://etpp.jakarta.go.id/evaluasi-kinerja/bawahan", {
    waitUntil: "networkidle",
  });

  await delay(3000);

  const cookies = await page.context().cookies();

  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const csrfToken = await page
    .locator('meta[name="csrf-token"]')
    .getAttribute("content");

  const axiosConfig = {
    headers: {
      Cookie: cookieHeader,
      "X-CSRF-TOKEN": csrfToken,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  };

  const summaryRows = [];

  const evaluasiRows = [];
  const indikatorRows = [];
  const perilakuRows = [];
  const feedbackRows = [];

  const uniqueNRK = new Map();

  // ====================================
  // SUMMARY
  // ====================================

  for (const endpoint of ENDPOINTS) {
    let pageNumber = 1;
    let lastPage = 1;

    do {
      const response = await axios.get(
        `${endpoint.url}?tahun=${tahun}&periode=${triwulan}&status=&page=${pageNumber}&limit=100`,
        axiosConfig,
      );

      const data = response.data;

      lastPage = data.last_page || 1;

      for (const item of data.data || []) {
        summaryRows.push({
          sumber_data: endpoint.tipe,
          nrk: item.v_nrk,
          nama: item.v_nama,
          jabatan: item.najabl,
          unit_kerja: item.unit_kerja,
          status: item.status,
          triwulan_kinerja: item.triwulan_kinerja,
          id_evaluasi: item.id_evaluasi,
          periode: triwulan,
          tahun,
        });

        if (!uniqueNRK.has(item.v_nrk)) {
          uniqueNRK.set(item.v_nrk, item);
        }
      }

      pageNumber++;
    } while (pageNumber <= lastPage);
  }

  // ====================================
  // DETAIL
  // ====================================

  const tahunBulan = getTahunBulan(tahun, triwulan);

  const employees = [...uniqueNRK.values()];

  console.log(`Total Pegawai: ${employees.length}`);

  for (const employee of employees) {
    try {
      console.log(`Processing ${employee.v_nrk} - ${employee.v_nama}`);

      const response = await axios.get(
        `https://etpp.jakarta.go.id/evaluasi-kinerja/get-data-evaluasi`,
        {
          ...axiosConfig,
          params: {
            tahun_bulan: tahunBulan,
            nrk: employee.v_nrk,
            periode: triwulan,
          },
        },
      );

      const evaluasi = response.data?.data?.[0];

      if (!evaluasi) continue;

      evaluasiRows.push({
        nrk: evaluasi.v_nrk,
        nama: evaluasi.nama_dinilai,
        jabatan: evaluasi.jabatan_dinilai,
        unit_kerja: evaluasi.unit_kerja_dinilai,

        periode: evaluasi.si_periode,
        tahun: evaluasi.v_tahun,

        status_proses_evaluasi: evaluasi.status_proses_evaluasi,

        predikat_kinerja: evaluasi.predikat_kinerja,

        rating_hasil_kerja: evaluasi.rating_hasil_kerja,

        rating_perilaku: evaluasi.rating_perilaku,

        nilai_hasil_kerja: evaluasi.nilai_hasil_kerja,

        nilai_perilaku: evaluasi.f_nilai_perilaku,

        nilai_organisasi: evaluasi.nilai_organisasi,

        nilai_kco: evaluasi.nilai_kco,

        capaian_organisasi: evaluasi.capaian_organisasi,

        catatan_rekomendasi: evaluasi.tx_catatan_rekomendasi,

        nama_penilai: evaluasi.nama_penilai,

        jabatan_penilai: evaluasi.jabatan_penilai,

        atasan_penilai: evaluasi.atasan_nama_penilai,

        atasan_jabatan_penilai: evaluasi.atasan_jabatan_penilai,
      });

      for (const indikator of evaluasi.evaluasi_indikator_utama || []) {
        indikatorRows.push({
          nrk: evaluasi.v_nrk,
          nama: evaluasi.nama_dinilai,

          nomor: indikator.nomor,

          indikator: indikator.v_indi_diintervensi,

          rencana_hasil_kerja: indikator.v_rencana_hasil_kerja,

          target: indikator.target,

          realisasi: indikator.v_realisasi_teks,

          satuan: indikator.v_satuan,

          umpan_balik: indikator.tx_umpan_balik,

          nilai_capaian: indikator.f_realisasi,
        });
      }

      for (const perilaku of evaluasi.perilaku_kerja || []) {
        perilakuRows.push({
          nrk: evaluasi.v_nrk,
          nama: evaluasi.nama_dinilai,

          kode_berakhlak: perilaku.e_kode_berakhlak,

          nama_perilaku: perilaku.nama_kode_berakhlak,

          ekspektasi: perilaku.tx_ekspektasi,

          umpan_balik: perilaku.tx_umpan_balik,

          nilai: perilaku.f_nilai,
        });

        for (const feedback of perilaku.umpan_balik || []) {
          feedbackRows.push({
            nrk: evaluasi.v_nrk,
            nama: evaluasi.nama_dinilai,

            nama_perilaku: perilaku.nama_kode_berakhlak,

            feedback: feedback.tx_umpan_balik,
          });
        }
      }
    } catch (err) {
      console.error(employee.v_nrk, employee.v_nama, err.message);
    }
  }

  // ====================================
  // SUMMARY FILE
  // ====================================

  const wbSummary = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wbSummary,
    XLSX.utils.json_to_sheet(summaryRows),
    "summary",
  );

  XLSX.writeFile(wbSummary, SUMMARY_FILE);

  // ====================================
  // DETAIL FILE
  // ====================================

  const wbDetail = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wbDetail,
    XLSX.utils.json_to_sheet(evaluasiRows),
    "evaluasi",
  );

  XLSX.utils.book_append_sheet(
    wbDetail,
    XLSX.utils.json_to_sheet(indikatorRows),
    "indikator_utama",
  );

  XLSX.utils.book_append_sheet(
    wbDetail,
    XLSX.utils.json_to_sheet(perilakuRows),
    "perilaku_kerja",
  );

  XLSX.utils.book_append_sheet(
    wbDetail,
    XLSX.utils.json_to_sheet(feedbackRows),
    "umpan_balik",
  );

  XLSX.writeFile(wbDetail, DETAIL_FILE);

  console.log("================================");
  console.log("Summary :", SUMMARY_FILE);
  console.log("Detail  :", DETAIL_FILE);
  console.log("================================");

  await browser.close();
})();
