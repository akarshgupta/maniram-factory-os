// ══════════════════════════════════════════════════════════════
// DISPATCH-PDF.JS — Delivery Challan PDF generator
// Uses jsPDF (loaded via CDN). Falls back to download if Web
// Share API (WhatsApp / native share sheet) is unavailable.
// ══════════════════════════════════════════════════════════════

async function generateDispatchPDF(orderId, dispatchedQty) {
  if (!window.jspdf) {
    alert('PDF library is still loading. Please wait a moment and try again.');
    return;
  }

  const o = orders.find(x => x.id === orderId);
  if (!o) return;

  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W    = 148;  // A5 width mm
  const mg   = 12;   // margin

  // ── Header bar ──────────────────────────────────────────────
  doc.setFillColor(4, 44, 83);
  doc.rect(0, 0, W, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Maniram Industries', mg, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Corrugated Box Manufacturers · Jhansi, U.P.', mg, 17);
  doc.text('GST: [YOUR GSTIN]', mg, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DELIVERY CHALLAN', W - mg, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`No: DC-${o.id}`, W - mg, 17.5, { align: 'right' });
  doc.text(`Date: ${dateStr}`, W - mg, 23, { align: 'right' });

  // ── Bill To box ─────────────────────────────────────────────
  let y = 36;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(210, 215, 220);
  doc.setLineWidth(0.3);
  doc.rect(mg, y, W - mg * 2, 24);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120, 130, 140);
  doc.text('BILL TO', mg + 3, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(10, 10, 10);
  doc.text(o.customer || '—', mg + 3, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const clientObj = (typeof CLIENTS !== 'undefined') ? CLIENTS.find(c => c.name === o.customer) : null;
  const cityLine  = clientObj ? [clientObj.city, clientObj.phone].filter(Boolean).join(' · ') : '';
  if (cityLine) doc.text(cityLine, mg + 3, y + 19);

  // ── Items table ──────────────────────────────────────────────
  y += 30;
  const COL = { desc: mg + 2, size: mg + 46, ply: mg + 70, qty: mg + 86, rate: mg + 103, amt: mg + 119 };

  doc.setFillColor(237, 242, 247);
  doc.rect(mg, y, W - mg * 2, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(50, 60, 70);
  doc.text('Description',   COL.desc, y + 5);
  doc.text('Size',          COL.size, y + 5);
  doc.text('Ply',           COL.ply,  y + 5);
  doc.text('Qty',           COL.qty,  y + 5);
  doc.text('Rate',          COL.rate, y + 5);
  doc.text('Amount',        COL.amt,  y + 5);

  y += 7.5;
  doc.setDrawColor(210, 215, 220);
  doc.line(mg, y, W - mg, y);

  const qty    = dispatchedQty || parseInt(o.qty) || 0;
  const rate   = parseFloat(o.rate) || 0;
  const amount = qty * rate;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(10, 10, 10);
  y += 7;
  const productName = o.product || o.id;
  doc.text(doc.splitTextToSize(productName, 42)[0], COL.desc, y);
  doc.text(o.size   || '—',               COL.size, y);
  doc.text(`${o.ply || 3}`,               COL.ply,  y);
  doc.text(qty.toLocaleString('en-IN'),    COL.qty,  y);
  doc.text(`₹${rate.toFixed(2)}`,         COL.rate, y);
  doc.text(`₹${amount.toLocaleString('en-IN')}`, COL.amt, y);

  y += 4;
  doc.setDrawColor(210, 215, 220);
  doc.line(mg, y, W - mg, y);

  // ── Totals ───────────────────────────────────────────────────
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Boxes:', COL.rate - 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 10, 10);
  doc.text(qty.toLocaleString('en-IN'), COL.amt, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Total Amount:', COL.rate - 20, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(4, 44, 83);
  doc.text(`₹${amount.toLocaleString('en-IN')}`, COL.amt, y);

  // ── Box specs note ───────────────────────────────────────────
  if (o.size || o.colour) {
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 110, 120);
    const specs = [o.size && `Size: ${o.size}`, o.colour && `Colour: ${o.colour}`, o.weight && `Wt: ${o.weight}g/box`].filter(Boolean).join('  ·  ');
    doc.text(specs, mg, y);
  }

  // ── Remarks ──────────────────────────────────────────────────
  if (o.remarks) {
    y += 7;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Remarks: ${o.remarks}`, mg, y, { maxWidth: W - mg * 2 });
  }

  // ── Signature lines ──────────────────────────────────────────
  const sigY = 168;
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.35);
  doc.line(mg,        sigY, mg + 45,    sigY);
  doc.line(W - mg - 45, sigY, W - mg, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text('Authorized Signature',    mg,            sigY + 4.5);
  doc.text("Receiver's Signature", W - mg - 45, sigY + 4.5);

  // ── Footer ───────────────────────────────────────────────────
  doc.setFillColor(245, 247, 250);
  doc.rect(0, 182, W, 28, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text('Maniram Industries · Jhansi, Uttar Pradesh', W / 2, 188, { align: 'center' });
  doc.text(`Order: ${o.id}  ·  Generated: ${today.toLocaleString('en-IN')}`, W / 2, 193, { align: 'center' });
  doc.setTextColor(180, 180, 180);
  doc.text('This is a computer-generated document.', W / 2, 198, { align: 'center' });

  // ── Share or download ────────────────────────────────────────
  const filename = `DC_${o.id}_${today.toISOString().split('T')[0]}.pdf`;
  const blob     = doc.output('blob');
  const file     = new File([blob], filename, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Delivery Challan — ${o.customer}`,
        text:  `${productName} · ${qty.toLocaleString('en-IN')} boxes`,
      });
    } catch (err) {
      if (err.name !== 'AbortError') doc.save(filename);
    }
  } else {
    doc.save(filename);
  }
}
