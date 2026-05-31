import axios from "axios";
import { chromium } from "playwright";
import { login } from "./login.js";

const tahun = 2026;
const triwulan = 1;

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

const waitAndClick = async (page, selector, timeout = 30000) => {
  await page.waitForSelector(selector, {
    state: "visible",
    timeout,
  });

  await page.locator(selector).first().click();
};

const confirmSwal = async (page) => {
  await waitAndClick(page, '.swal2-modal button:has-text("Setuju")', 120000);

  await waitAndClick(page, '.swal2-modal button:has-text("OK")', 120000);
};

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

  const uniqueNRK = new Map();

  // ====================================
  // AMBIL DAFTAR PEGAWAI
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
        if (!uniqueNRK.has(item.v_nrk)) {
          uniqueNRK.set(item.v_nrk, item);
        }
      }

      pageNumber++;
    } while (pageNumber <= lastPage);
  }

  const tahunBulan = getTahunBulan(tahun, triwulan);

  const employees = [...uniqueNRK.values()].filter(
    (item) => item.status === "Draft",
  );

  console.log(`Total Pegawai: ${employees.length}`);

  // ====================================
  // PROCESS PEGAWAI
  // ====================================

  for (const employee of employees) {
    try {
      console.log(`\n=== ${employee.v_nrk} - ${employee.v_nama} ===`);

      // ====================================
      // GET DATA EVALUASI
      // ====================================

      const evaluasiResponse = await axios.get(
        `https://etpp.jakarta.go.id/evaluasi-kinerja/get-data-evaluasi?tahun_bulan=${tahunBulan}&nrk=${employee.v_nrk}&periode=${triwulan}`,
        axiosConfig,
      );

      const evaluasi = evaluasiResponse.data?.data?.[0];

      if (!evaluasi) {
        console.log("Data evaluasi tidak ditemukan");
        continue;
      }

      const indikatorUtama = evaluasi.evaluasi_indikator_utama || [];

      if (!indikatorUtama.length) {
        console.log("Tidak ada indikator utama");
        continue;
      }

      // ====================================
      // OPEN PAGE
      // ====================================

      const inputUrl = `https://etpp.jakarta.go.id/evaluasi-kinerja/${employee.v_nrk}/${tahunBulan}/${triwulan}/input-umpan-balik`;

      await page.goto(inputUrl, {
        waitUntil: "networkidle",
      });

      await delay(2000);

      const rows = await page.locator("#utama tbody tr").count();

      console.log(`Total indikator: ${rows}`);

      // ====================================
      // ITERASI INDIKATOR
      // ====================================

      for (
        let indikatorIndex = 0;
        indikatorIndex < Math.min(rows, indikatorUtama.length);
        indikatorIndex++
      ) {
        try {
          const indikator = indikatorUtama[indikatorIndex];

          const realisasi = indikator.f_realisasi || 100;

          console.log(
            `Indikator ${indikatorIndex + 1} | Realisasi=${realisasi}`,
          );

          // ====================================
          // GET FEEDBACK TEMPLATE
          // ====================================

          const feedbackResponse = await axios.get(
            `https://etpp.jakarta.go.id/evaluasi-kinerja/get-data-umpan-balik?realisasi=${realisasi}&jenis_penilaian=hasil_kerja`,
            axiosConfig,
          );

          const feedbackList = feedbackResponse.data || [];

          if (!feedbackList.length) {
            console.log("Tidak ada template umpan balik");
            continue;
          }

          const randomFeedback =
            feedbackList[Math.floor(Math.random() * feedbackList.length)]
              ?.tx_umpan_balik;

          if (!randomFeedback) {
            continue;
          }

          const row = page.locator("#utama tbody tr").nth(indikatorIndex);

          const editButton = row.locator('button[title="Ubah"]');

          if (!(await editButton.count())) {
            continue;
          }

          await editButton.click();

          await delay(1000);

          await page.evaluate(() => {
            document
              .querySelector("#form-umpan-balik #keterangan")
              .removeAttribute("readonly");
          });

          await page.fill("#form-umpan-balik #keterangan", randomFeedback);

          await page.click('#form-umpan-balik button:has-text("Simpan")');

          await confirmSwal(page);

          console.log(`✓ Feedback indikator ${indikatorIndex + 1}`);

          await delay(1000);
        } catch (err) {
          console.error(`Indikator ${indikatorIndex + 1}`, err.message);
        }
      }

      // ====================================
      // PERILAKU KERJA
      // ====================================

      const perilakuKerja = evaluasi.perilaku_kerja || [];

      if (perilakuKerja.length) {
        console.log(`Total perilaku kerja: ${perilakuKerja.length}`);

        const perilakuRows = await page.locator("#perilaku tbody tr").count();

        for (
          let perilakuIndex = 0;
          perilakuIndex < Math.min(perilakuRows, perilakuKerja.length);
          perilakuIndex++
        ) {
          try {
            const perilaku = perilakuKerja[perilakuIndex];

            const feedbackList = perilaku.umpan_balik || [];

            if (!feedbackList.length) {
              console.log(
                `Perilaku ${perilakuIndex + 1} tidak memiliki referensi feedback`,
              );

              continue;
            }

            const randomFeedback =
              feedbackList[Math.floor(Math.random() * feedbackList.length)]
                ?.tx_umpan_balik;

            if (!randomFeedback) {
              continue;
            }

            console.log(
              `Perilaku ${perilakuIndex + 1}: ${perilaku.nama_kode_berakhlak}`,
            );

            const row = page.locator("#perilaku tbody tr").nth(perilakuIndex);

            const editButton = row.locator('button[title="Ubah"]');

            if (!(await editButton.count())) {
              console.log(
                `Tombol ubah tidak ditemukan pada perilaku ${perilakuIndex + 1}`,
              );

              continue;
            }

            await editButton.click();

            await delay(1000);

            await page.fill("#form-umpan-balik #keterangan", randomFeedback);

            await page.click('#form-umpan-balik button[type="submit"]');

            await confirmSwal(page);

            console.log(`✓ Feedback perilaku ${perilakuIndex + 1} berhasil`);

            await delay(1000);
          } catch (err) {
            console.error(`Perilaku ${perilakuIndex + 1}`, err.message);
          }
        }
      }

      await page.click(
        '.summary-box .summary-row.action-row button:has-text("Ubah"):nth-child(1)',
      );

      await page.selectOption(
        "#form-rekomendasi .custom-select.custom-select-sm",
        {
          label: "Coaching",
        },
      );

      await page.click("button:has-text('Simpan')");

      await confirmSwal(page);

      await page.click(
        '.summary-box .summary-row.action-row button:has-text("Ubah"):nth-child(2)',
      );

      await page.fill(
        "[placeholder='Tuliskan catatan...']",
        "Pegawai menunjukkan kinerja yang baik dan sesuai ekspektasi. Diharapkan agar pegawai mempertahankan kinerja yang telah dicapai dan meningkatkan kompetensi teknis untuk mendukung efektivitas pelaksanaan tugas.",
      );

      await page.click("button:has-text('Simpan')");

      await confirmSwal(page);

      console.log(`Selesai ${employee.v_nrk} - ${employee.v_nama}`);
    } catch (err) {
      console.error(employee.v_nrk, employee.v_nama, err.message);
    }
  }

  await browser.close();
})();
