import data from "./hasil-validasi-1778158148663.json" with { type: "json" };
import fs from "fs";
import path from "path";

const RESULT_CSV_PATH = path.join(
  process.cwd(),
  `hasil-validasi-1778158148663.csv`,
);

const saveCsvFile = (validationResults) => {
  const csvContent = [
    [
      "Timestamp",
      "NRK",
      "Nama",
      "Jabatan",
      "Unit Kerja",
      "Renaksi",
      "Target",
      "Realisasi",
      "Target Compact",
      "Realisasi Compact",
      "Realisasi Kurang dari Target",
      "Realisasi Lebih dari Target",
    ],
    ...validationResults.map((result) => [
      result.timestamp,
      result.nrk,
      result.nama,
      result.jabatan,
      result.unit_kerja,
      result.renaksi,
      result.target,
      result.realisasi,
      result.target_compact,
      result.realisasi_compact,
      result.realisasi_kurang_dari_target,
      result.realisasi_lebih_dari_target,
    ]),
  ]
    .map((row) => row.join(";"))
    .join("\n");

  fs.writeFileSync(RESULT_CSV_PATH, csvContent);

  console.log(`💾 CSV berhasil disimpan: ${RESULT_CSV_PATH}`);
};

(() => {
  saveCsvFile(data);
})();
