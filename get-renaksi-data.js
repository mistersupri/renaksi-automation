import axios from "axios";
import * as XLSX from "xlsx";
import { chromium } from "playwright";
import { login } from "./login.js";
import { encodeParams } from "./encodeParams.js";

const tahun = 2025;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OUTPUT_FILE = `rekap-kinerja-${tahun}.xlsx`;

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });

  const page = await browser.newPage();

  await login(page);

  console.log("🌐 Membuka halaman daftar kinerja bawahan...");

  await page.goto("https://etpp.jakarta.go.id/evaluasi-kinerja/bawahan", {
    waitUntil: "networkidle",
  });

  await delay(3000);

  // ==========================================
  // COOKIE + CSRF
  // ==========================================

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

  // ==========================================
  // AMBIL SEMUA PEGAWAI
  // ==========================================

  const employees = [];

  let pageNumber = 1;
  let lastPage = 1;

  console.log("📥 Mengambil daftar pegawai...");

  do {
    const url =
      `https://etpp.jakarta.go.id/mankin/daftar-kinerja-bawahan` +
      `?tahun=${tahun}&page=${pageNumber}&limit=100&sort_by=nrk&sort_desc=asc&column_filters%5B%5D=nrk&column_filters%5B%5D=nama&column_filters%5B%5D=jabatan`;

    console.log(`➡️ Page ${pageNumber}`);

    const response = await axios.get(url, axiosConfig);

    const json = response.data;

    lastPage = json?.meta?.last_page || 1;

    employees.push(...(json.data || []));

    console.log(
      `✅ Page ${pageNumber} selesai (${json.data?.length || 0} data)`,
    );

    pageNumber++;
  } while (pageNumber <= lastPage);

  console.log(`👥 Total Pegawai: ${employees.length}`);

  // ==========================================
  // SHEET PEGAWAI
  // ==========================================

  const pegawaiRows = employees.map((emp) => ({
    skp_id: emp.skp_id,
    nrk: emp.nrk,
    nama: emp.nama,
    jabatan: emp.jabatan,
    unit_kerja: emp.unit_kerja,

    progress_total: emp.progress?.total,
    progress_tervalidasi: emp.progress?.tervalidasi,

    status_code: emp.status?.code,
    status_label: emp.status?.label,

    ekspektasi_total: emp.ekspektasi?.total,
    ekspektasi_terisi: emp.ekspektasi?.terisi,

    penilai_nrk: emp.penilai?.nrk,
    penilai_nama: emp.penilai?.nama,
    penilai_jabatan: emp.penilai?.jabatan_penilai,

    pejabat_rekomendasi_nrk: emp.pejabat_rekomendasi?.nrk,

    pejabat_rekomendasi_nama: emp.pejabat_rekomendasi?.nama,

    pejabat_rekomendasi_jabatan: emp.pejabat_rekomendasi?.jabatan,
  }));

  // ==========================================
  // DETAIL KINERJA
  // ==========================================

  const kinerjaRows = [];

  console.log("📊 Mengambil detail kinerja pegawai...");

  for (let i = 0; i < employees.length; i++) {
    const employee = employees[i];

    try {
      console.log(
        `[${i + 1}/${employees.length}] ${employee.nrk} - ${employee.nama}`,
      );

      const encodedSkp = encodeParams(employee.skp_id);

      const detailUrl =
        `https://etpp.jakarta.go.id/mankin/${encodedSkp}` +
        `/data-kinerja-pegawai`;

      const detailResponse = await axios.get(detailUrl, axiosConfig);

      const details = detailResponse.data?.data || [];

      console.log(`   📄 ${details.length} indikator ditemukan`);

      for (const item of details) {
        kinerjaRows.push({
          skp_id: employee.skp_id,
          nrk: employee.nrk,
          nama: employee.nama,
          jabatan: employee.jabatan,
          unit_kerja: employee.unit_kerja,

          indikator_id: item.i_id,

          rencana_hasil_kerja_diintervensi:
            item.rencana_hasil_kerja_diintervensi,

          rencana_hasil_kerja: item.rencana_hasil_kerja,

          indikator_kinerja_individu: item.indikator_kinerja_individu,

          target_tahunan: item.target_tahunan,

          satuan: item.satuan,

          status_code: item.status_code,

          status_label: item.status?.label,

          target_tw1: item.target_triwulan?.tw_1,

          target_tw2: item.target_triwulan?.tw_2,

          target_tw3: item.target_triwulan?.tw_3,

          target_tw4: item.target_triwulan?.tw_4,

          perjanjian_total: item.perjanjian?.total,

          perjanjian_terisi: item.perjanjian?.terisi,

          slug_path: item.slug_path,
        });
      }

      await delay(300);
    } catch (err) {
      console.error(`❌ ${employee.nrk} - ${employee.nama}`, err.message);
    }
  }

  // ==========================================
  // EXPORT EXCEL
  // ==========================================

  console.log("💾 Membuat file Excel...");

  const workbook = XLSX.utils.book_new();

  const pegawaiSheet = XLSX.utils.json_to_sheet(pegawaiRows);

  const kinerjaSheet = XLSX.utils.json_to_sheet(kinerjaRows);

  XLSX.utils.book_append_sheet(workbook, pegawaiSheet, "Pegawai");

  XLSX.utils.book_append_sheet(workbook, kinerjaSheet, "Kinerja");

  XLSX.writeFile(workbook, OUTPUT_FILE);

  console.log(`✅ Excel berhasil dibuat: ${OUTPUT_FILE}`);

  await browser.close();
})();
