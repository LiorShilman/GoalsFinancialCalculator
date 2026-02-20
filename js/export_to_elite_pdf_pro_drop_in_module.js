/*
 * exportToElitePDF (pro extended)
 * HTML + PDF export, עם איסוף נתונים מלא מה־DOM
 */

export async function exportCurrentReport({ mode = 'html' } = {}) {
  const report = document.getElementById('report'); // הקונטיינר של הדו"ח
  if (!report) {
    alert("לא נמצא אלמנט דו\"ח עם id='report'");
    return;
  }

  // משכפלים את ה־DOM של הדו"ח
  const cloned = report.cloneNode(true);

  // המרת כל canvas לתמונה
  const canvases = report.querySelectorAll("canvas");
  const clones = cloned.querySelectorAll("canvas");

  canvases.forEach((canvas, i) => {
    try {
      const img = document.createElement("img");
      img.src = canvas.toDataURL("image/png");
      img.style.maxWidth = "100%";
      img.style.display = "block";
      clones[i].replaceWith(img);
    } catch (e) {
      console.error("שגיאה בהמרת canvas ל־img:", e);
    }
  });

  // לוקחים את כל ה־CSS מהעמוד (style ו־link)
  let css = "";

  // <style> פנימיים
  document.querySelectorAll("style").forEach(styleEl => {
    css += styleEl.innerHTML + "\n";
  });

  // <link rel="stylesheet"> חיצוניים – נטען את התוכן ונכניס inline
  const linkEls = Array.from(document.querySelectorAll("link[rel='stylesheet']"));
  for (let link of linkEls) {
    try {
      const resp = await fetch(link.href);
      const text = await resp.text();
      css += "\n/* ---- " + link.href + " ---- */\n" + text;
    } catch (e) {
      console.warn("לא הצלחתי לטעון CSS מ:", link.href, e);
    }
  }

  // בונים HTML מלא כולל CSS inline
  const fullHTML = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <title>דו"ח פיננסי</title>
    <style>
      ${css}
    </style>
  </head>
  <body>
    ${cloned.outerHTML}
  </body>
  </html>`;

  if (mode === 'print') {
    const w = window.open('', '_blank');
    if (!w) { alert('חוסם פופ-אפים פעיל'); return; }
    w.document.open();
    w.document.write(fullHTML);
    w.document.close();
    w.onload = () => setTimeout(() => { w.print(); }, 350);
  } else {
    const blob = new Blob([fullHTML], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `דו"ח_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}



/** בניית הדו"ח */
export function eliteReportHTML(data, chartImages = {}) {
  const dateStr = new Date().toLocaleDateString('he-IL');

  let html = `
  <!DOCTYPE html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8">
    <title>דו"ח פיננסי</title>
    <style>
  body {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    direction: rtl;
    margin: 2cm;
    background-color: #121212;   /* רקע כהה */
    color: #e0e0e0;              /* טקסט בהיר */
    line-height: 1.6;
  }

  h1, h2, h3 {
    color: #64b5f6;              /* כחול בהיר */
    margin-bottom: 0.5em;
  }

  .header {
    border-bottom: 2px solid #64b5f6;
    margin-bottom: 20px;
    padding-bottom: 10px;
  }

  table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 1.5em 0;
  background: #1c1c1c;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.6);
}

th {
  background: linear-gradient(90deg, #263238, #1f2a33);
  color: #90caf9;
  font-weight: 600;
  text-align: center;
  padding: 12px 10px;
  border-bottom: 2px solid #333;
  font-size: 14px;
  letter-spacing: 0.5px;
}

td {
  padding: 12px 10px;
  text-align: center;
  font-size: 13px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  color: #e0e0e0;
}

tr:last-child td {
  border-bottom: none;
}

tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.02);
}

tr:hover td {
  background: rgba(255, 255, 255, 0.05);
}

.table-section-title {
  font-size: 16px;
  font-weight: bold;
  color: #64b5f6;
  margin-bottom: 8px;
  border-bottom: 1px solid #333;
  padding-bottom: 4px;
}

  .section {
    page-break-inside: avoid;
    margin-bottom: 40px;
  }

  .img-container {
    text-align: center;
    margin: 20px 0;
  }

  .img-container img {
    border: 2px solid #333;
    border-radius: 8px;
    background-color: #000;
    padding: 4px;
  }

  strong {
    color: #ffb74d; /* כתום להדגשות */
  }
</style>

  </head>
  <body>
    <div class="header">
      <h1>דו"ח פיננסי אישי</h1>
      <p><strong>תאריך הפקה:</strong> ${dateStr}</p>
      ${data.clientName ? `<p><strong>שם לקוח:</strong> ${data.clientName}</p>` : ''}
      ${data.advisorName ? `<p><strong>שם יועץ:</strong> ${data.advisorName}</p>` : ''}
    </div>
  `;

  // מטרות פיננסיות
  if (data.goals && data.goals.length > 0) {
    html += `
<div class="section">
  <h2>פרטי הגדרות</h2>
  <table>
    <tr><th>הכנסה חודשית</th><td>${data.settings?.monthlyIncome?.toLocaleString('he-IL')} ₪</td></tr>
    <tr><th>הפקדה כללית</th><td>${data.settings?.generalMonthlyDeposit?.toLocaleString('he-IL')} ₪</td></tr>
    <tr><th>הון נוכחי</th><td>${data.settings?.globalSaved?.toLocaleString('he-IL')} ₪</td></tr>
    <tr><th>ריבית שנתית</th><td>${data.settings?.globalAnnualRate}%</td></tr>
    <tr><th>אינפלציה</th><td>${data.settings?.inflationAnnualPct}%</td></tr>
    <tr><th>חישוב</th><td>${data.settings?.computeReal ? 'ריאלי' : 'נומינלי'}</td></tr>
  </table>
</div>`;

if (data.goals?.length) {
  html += `
  <div class="section">
    <h2>מטרות</h2>
    <table>
      <tr><th>שם</th><th>יעד</th><th>תאריך</th><th>ריבית</th><th>חיסכון חודשי</th><th>הון קיים</th></tr>
      ${data.goals.map(g => `
        <tr>
          <td>${g.name}</td>
          <td>${g.amount.toLocaleString('he-IL')} ₪</td>
          <td>${g.dateString || (g.targetDate?.toLocaleDateString('he-IL') || '')}</td>
          <td>${g.rateAnnual}%</td>
          <td>${g.monthlyPayment.toLocaleString('he-IL')} ₪</td>
          <td>${g.existingCapital.toLocaleString('he-IL')} ₪</td>
        </tr>
      `).join('')}
    </table>
  </div>`;
}

html += `
<div class="section">
  <h2>מדדים נגזרים</h2>
  <table>
    <tr><th>סה״כ מוקצה חודשי</th><td>${data.derived?.monthlyAssigned?.toLocaleString('he-IL') || '—'} ₪</td></tr>
    <tr><th>בלתי מוקצה</th><td>${data.derived?.monthlyUnassigned?.toLocaleString('he-IL') || '—'} ₪</td></tr>
  </table>
</div>`;
  }

  // טבלת בונוסים
  if (data.bonusTableHTML) {
    html += `<div class="section"><h2>טבלת בונוסים</h2>${data.bonusTableHTML}</div>`;
  }

  // גרפים
  if (chartImages.savingsChart) {
    html += `<div class="section"><h2>תרשים חיסכון</h2><div class="img-container"><img src="${chartImages.savingsChart}" style="max-width:90%"></div></div>`;
  }
  if (chartImages.cashflowChart) {
    html += `<div class="section"><h2>תרשים תזרים מזומנים</h2><div class="img-container"><img src="${chartImages.cashflowChart}" style="max-width:90%"></div></div>`;
  }

  // טבלאות נוספות
  if (data.extraTables) {
    Object.entries(data.extraTables).forEach(([id, tbl]) => {
      html += `<div class="section"><h2>טבלה: ${id}</h2>${tbl}</div>`;
    });
  }

  html += `</body></html>`;
  return html;
}

