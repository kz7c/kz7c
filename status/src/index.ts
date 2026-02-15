import * as fs from "fs";
import dotenv from "dotenv";

// ローカル実行時は .env から読み込む
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const token = process.env.GITHUB_TOKEN;

/*------------------
/*Types
--------------------*/
type GitHubRepo = {
  name: string;
  language: string | null;
  languages_url: string;
};

type LanguageStats = { // Lang list
  [key: string]: number;
};
const totalLanguages: LanguageStats = {};

/*------------------
/*Consts
--------------------*/
const headers = token ? { Authorization: `token ${token}` } : {};
const username: string = "kz7c";
const api = `https://api.github.com/users/${username}/repos`;


/*------------------
/*API request
--------------------*/
const response = await fetch(api, { headers });

if (!response.ok) {
  throw new Error(`GitHub API error: ${response.status}`);
}

const repos: GitHubRepo[] = (await response.json());


/*------------------
/*Totalling
--------------------*/
// Calculate the total number of bytes for each lang
for (const repo of repos) {
  try {
    const langResponse = await fetch(repo.languages_url, { headers });
    if (!langResponse.ok) continue;
    
    const languages: LanguageStats = await langResponse.json();
    
    for (const [lang, bytes] of Object.entries(languages)) {
      totalLanguages[lang] = (totalLanguages[lang] || 0) + (bytes as number);
    }
  } catch (error) {
    console.error(`Failed to fetch languages for ${repo.name}`);
  }
}

// Calculate the percentage
const totalBytes = Object.values(totalLanguages).reduce((sum, bytes) => sum + bytes, 0);
let languagePercentages = Object.entries(totalLanguages)
  .map(([lang, bytes]) => ({
    language: lang,
    bytes,
    percentage: ((bytes / totalBytes) * 100).toFixed(2)
  }))
  .sort((a, b) => b.bytes - a.bytes);

// 10%未満の言語をまとめる
const major = languagePercentages.filter((item) => parseFloat(item.percentage) >= 10);
const minor = languagePercentages.filter((item) => parseFloat(item.percentage) < 10);

if (minor.length > 0) {
  const otherBytes = minor.reduce((sum, item) => sum + item.bytes, 0);
  const otherPercentage = ((otherBytes / totalBytes) * 100).toFixed(2);
  languagePercentages = [
    ...major,
    {
      language: "Others",
      bytes: otherBytes,
      percentage: otherPercentage
    }
  ];
}

/*------------------
/*Export the result
--------------------*/
console.log(`総バイト数: ${totalBytes}\n`);
languagePercentages.forEach((item) => {
  console.log(`${item.language}: ${item.percentage}% (${item.bytes} bytes)`);
});

/*------------------
/*Create language-chart.svg
--------------------*/
// chart color list
const colors = [
  "#850000", "#007169", "#006075", "#832500", "#008967",
  "#977900", "#540079", "#00527e", "#7b2300", "#00187a"
];
// other colors
const radius_color = "#FFD700";

let currentAngle = -90;// 始点
const radius = 80;
const centerX = 80;
const centerY = 80;
const labelRadius = 50;// 円上ラベルの半径位置

const svgPaths: string[] = [];
const svgLabels: string[] = [];

languagePercentages.forEach((item, index) => {
  const sliceAngle = (parseFloat(item.percentage) / 100) * 360;
  const startAngle = currentAngle;
  const endAngle = currentAngle + sliceAngle;
  const midAngle = (startAngle + endAngle) / 2;
  
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  
  const x1 = centerX + radius * Math.cos(startRad);
  const y1 = centerY + radius * Math.sin(startRad);
  const x2 = centerX + radius * Math.cos(endRad);
  const y2 = centerY + radius * Math.sin(endRad);
  
  const largeArc = sliceAngle > 180 ? 1 : 0;
  const pathData = `
    M ${centerX} ${centerY}
    L ${x1} ${y1}
    A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
    Z
  `;
  
  // ラベルの位置を計算
  const midRad = (midAngle * Math.PI) / 180;
  const labelX = centerX + labelRadius * Math.cos(midRad);
  const labelY = centerY + labelRadius * Math.sin(midRad);
  
  const color = colors[index % colors.length];
  svgPaths.push(`<path d="${pathData}" fill="${color}" stroke="${radius_color}" stroke-width="2"/>`);
  
  // 割合が小さい場合はラベルを表示しない
  if (parseFloat(item.percentage) > 3) {
    svgLabels.push(`
      <text x="${labelX}" y="${labelY - 6}" font-size="9" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white" stroke="black" stroke-width="0.5" paint-order="stroke">
        ${item.language}
      </text>
      <text x="${labelX}" y="${labelY + 6}" font-size="9" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white" stroke="black" stroke-width="0.5" paint-order="stroke">
        ${item.percentage}%
      </text>
    `);
  }
  
  currentAngle = endAngle;
});

const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="350" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="350" height="200" fill="#1A1B27"/>
  <g transform="translate(20, 20)">
    ${svgPaths.join("\n")}
    ${svgLabels.join("\n")}
  </g>
  
  <g transform="translate(220, 30)">
    ${languagePercentages.map((item, index) => {
      const color = colors[index % colors.length];
      const yOffset = index * 20;
      return `
        <rect x="0" y="${yOffset}" width="12" height="12" fill="${color}" stroke="${radius_color}" stroke-width="1"/>
        <text x="16" y="${yOffset + 10}" font-size="10" fill="#ffffff">${item.language}(${item.bytes} bytes)</text>
      `;
    }).join("\n")}
  </g>
</svg>`;

fs.writeFileSync("language-chart.svg", svgContent);
console.log("\n✓ language-chart.svg を生成しました");
