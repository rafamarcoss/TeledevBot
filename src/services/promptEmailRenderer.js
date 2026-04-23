const SECTION_KEYS = {
  resumen: 'summary',
  'problemas detectados': 'problems',
  problemas: 'problems',
  issues: 'problems',
  'mejoras recomendadas': 'improvements',
  mejoras: 'improvements',
  recomendaciones: 'improvements',
  'archivos probablemente afectados': 'files',
  'archivos afectados': 'files',
  archivos: 'files',
  'siguientes pasos': 'nextSteps',
  'proximos pasos': 'nextSteps',
  'próximos pasos': 'nextSteps',
  'plan de accion': 'nextSteps',
  'plan de acción': 'nextSteps'
};

const EMPTY_SECTION_MESSAGES = [
  'No se detectaron problemas específicos en la salida de Codex.',
  'Codex no separó recomendaciones en una sección específica.',
  'Codex no separó recomendaciones en una sección específica. Revisa el resumen general del informe.',
  'Codex no identificó archivos afectados en una sección específica.',
  'No se indicaron siguientes pasos en una sección específica.',
  'Sin observaciones adicionales.',
  'Codex terminó sin devolver contenido de análisis.'
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHeading(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^\d+\s*(?:[).\-\u2013\u2014]|&mdash;)?\s*/, '')
    .replace(/[:：]+$/, '')
    .trim();
}

function findSectionKey(line) {
  const normalized = normalizeHeading(line);
  return SECTION_KEYS[normalized] || null;
}

function cleanSectionText(lines) {
  const text = lines.join('\n').trim();
  if (EMPTY_SECTION_MESSAGES.includes(text)) {
    return '';
  }

  return text;
}

function parseSections(text) {
  const sections = {
    summary: [],
    problems: [],
    improvements: [],
    files: [],
    nextSteps: [],
    general: []
  };
  let current = 'general';

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const key = findSectionKey(line);

    if (key) {
      current = key;
      continue;
    }

    sections[current].push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([key, lines]) => [key, cleanSectionText(lines)])
  );
}

function renderParagraph(text) {
  return `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.75;color:#333333;font-family:Arial,sans-serif;">${escapeHtml(text)}</p>`;
}

function renderList(items) {
  const renderedItems = items
    .map((item) => `<li style="margin:0 0 8px 0;">${escapeHtml(item)}</li>`)
    .join('');

  return `<ul style="margin:0 0 12px 18px;padding:0;font-size:14px;line-height:1.65;color:#333333;font-family:Arial,sans-serif;">${renderedItems}</ul>`;
}

function renderCodeBlock(text) {
  return `<pre style="margin:0 0 14px 0;background-color:#f0f2f5;border-radius:4px;padding:12px 14px;font-size:12px;line-height:1.55;color:#333333;font-family:Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</pre>`;
}

function hasContent(text) {
  const value = String(text || '').trim();
  return value.length > 0;
}

function renderTextBlock(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }

  const parts = value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return parts.map((part) => {
    const lines = part.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const listItems = lines
      .filter((line) => /^[-*]\s+/.test(line) || /^\d+[\.)]\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[\.)]\s+/, '').trim());

    if (listItems.length > 0 && listItems.length === lines.length) {
      return renderList(listItems);
    }

    if (part.length > 900 || lines.some((line) => line.length > 160)) {
      return renderCodeBlock(part);
    }

    return renderParagraph(lines.join(' '));
  }).join('');
}

function renderMetaRow(label, value) {
  return `
    <tr>
      <td style="padding:6px 10px 6px 0;font-size:12px;font-weight:700;color:#a19679;font-family:Arial,sans-serif;vertical-align:top;width:90px;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-size:12px;color:#333333;font-family:Arial,sans-serif;vertical-align:top;word-break:break-word;">${escapeHtml(value || '(sin dato)')}</td>
    </tr>`;
}

function renderMetaTable(report) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;background-color:#f0f2f5;border-radius:6px;padding:10px 12px;">
      ${renderMetaRow('Repo', report.repoName)}
      ${renderMetaRow('Ruta', report.repoPath)}
      ${renderMetaRow('Inicio', report.startedAt)}
      ${renderMetaRow('Fin', report.finishedAt)}
      ${renderMetaRow('Estado', report.status)}
    </table>`;
}

function renderPrompt(report) {
  return `
    <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a19679;font-family:Arial,sans-serif;">Prompt lanzado</p>
    ${renderCodeBlock(report.prompt || '')}`;
}

function collectErrors(report) {
  const errors = [
    report.errorText,
    report.result?.stderr,
    ...(report.result?.errors || [])
  ].filter(Boolean).join('\n');

  return errors;
}

function collectObservations(report) {
  const observations = [];

  if (report.result?.turnCompleted === false) {
    observations.push('Codex no marcó el turno como completado.');
  }

  if (report.result?.exitCode !== undefined && report.result.exitCode !== null && report.result.exitCode !== 0) {
    observations.push(`Código de salida: ${report.result.exitCode}.`);
  }

  if ((report.result?.parseErrorCount ?? 0) > 0) {
    observations.push(`Errores de parseo JSON: ${report.result.parseErrorCount}.`);
  }

  return observations.join('\n');
}

function renderSectionLabel(index, title) {
  return `<p style="margin:0 0 12px 0;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a19679;font-family:Arial,sans-serif;">${String(index).padStart(2, '0')} &mdash; ${escapeHtml(title)}</p>`;
}

function renderSectionCard(content, isLast = false) {
  if (!hasContent(content)) {
    return '';
  }

  const radius = isLast ? 'border-radius:0 0 8px 8px;' : '';

  return `
          <tr>
            <td style="background-color:#ffffff;${radius}padding:28px 36px 24px 36px;">
              ${content}
            </td>
          </tr>`;
}

function renderOptionalReportSection(index, title, heading, content) {
  if (!hasContent(content)) {
    return '';
  }

  return `
              ${renderSectionLabel(index, title)}
              <h2 style="margin:0 0 18px 0;font-size:17px;font-weight:700;color:#0088cc;font-family:Arial,sans-serif;">${escapeHtml(heading)}</h2>
              ${renderTextBlock(content)}`;
}

function renderSeparator() {
  return '<tr><td style="background-color:#f0f2f5;height:8px;"></td></tr>';
}

export function renderPromptEmail(report) {
  const resultText = report.resultText || report.result?.output || '';
  const sections = parseSections(resultText);
  const summary = sections.summary || sections.general || resultText;
  const observations = collectObservations(report);

  const problems = [
    sections.problems,
    !report.success ? collectErrors(report) : ''
  ].filter(Boolean).join('\n\n');

  const summaryCard = `
                    ${renderSectionLabel(1, 'Resumen')}
                    <h2 style="margin:0 0 14px 0;font-size:17px;font-weight:700;color:#0088cc;font-family:Arial,sans-serif;">Descripción del proyecto</h2>
                    ${renderMetaTable(report)}
                    ${renderPrompt(report)}
                    ${renderTextBlock(summary)}`;

  let nextIndex = 2;
  const optionalCards = [
    ['Problemas detectados', 'Issues identificados', problems],
    ['Mejoras recomendadas', 'Acciones sugeridas', sections.improvements],
    ['Archivos afectados', 'Archivos probablemente afectados', sections.files],
    ['Siguientes pasos', 'Plan de acción', sections.nextSteps],
    ['Observaciones relevantes', 'Detalles de ejecución', observations]
  ].map(([title, heading, content]) => {
    const card = renderOptionalReportSection(nextIndex, title, heading, content);
    if (card) {
      nextIndex += 1;
    }
    return card;
  }).filter(Boolean);

  const cards = [summaryCard, ...optionalCards];
  const contentHtml = cards
    .map((card, index) => `${index > 0 ? renderSeparator() : ''}${renderSectionCard(card, index === cards.length - 1)}`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe de Análisis – TeledevBot</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:Arial,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <tr>
            <td style="background-color:#0088cc;border-radius:8px 8px 0 0;padding:32px 36px 28px 36px;">
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.65);font-family:Arial,sans-serif;">Análisis de código</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;line-height:1.2;">Informe de Análisis</h1>
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;">TeledevBot &mdash; Bot de control de desarrollo en Telegram</p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#a19679;height:4px;"></td>
          </tr>

${contentHtml}

          <tr>
            <td style="padding:20px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a19679;font-family:Arial,sans-serif;letter-spacing:0.5px;">Informe generado por análisis de Codex &mdash; TeledevBot</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}
