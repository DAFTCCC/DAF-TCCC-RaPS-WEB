(() => {
  'use strict';

  // EDIT ONLY THIS BLOCK when program ownership/contact information changes.
  window.TCCC_BRANDING = {
    productName: 'TCCC Evaluation Suite',
    attributionLabel: 'Program Ownership / Attribution',
    officeName: 'John Garcia',
    officeSymbol: 'Tactical Combat Casualty Care Office',
    website: '',
    ownershipNotice: 'Developed and maintained for DAF TCCC training and evaluation support. Use of DAF, DHA, or JTS references in this tool does not by itself constitute endorsement or certification of this software.',
    dataNotice: 'Use only the minimum student information required for an authorized training record. Do not enter classified information, CUI, PHI, patient/casualty identifiers, SSNs, DoD ID numbers, medical-record information, or other protected data unless this application and hosting environment have been specifically approved for that data.',
    copyrightLine: '© 2026. Program attribution information is maintained by the sponsoring office.'
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function meaningful(v) {
    return v && !/^\[ADD /.test(v);
  }

  function setSafetyOpen(isOpen) {
    const splash = document.getElementById('welcomeSplash');
    if (!splash) return;
    splash.classList.toggle('open', isOpen);
    splash.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body.classList.toggle('safetyLocked', isOpen);
    if (isOpen) {
      const ack = document.getElementById('safetyAck');
      const enter = document.getElementById('safetyEnterBtn');
      if (ack) ack.checked = false;
      if (enter) enter.disabled = true;
      setTimeout(() => ack?.focus(), 30);
    }
  }

  function setupSafetySplash() {
    const splash = document.getElementById('welcomeSplash');
    if (!splash) return;
    const b = window.TCCC_BRANDING;
    const owner = document.getElementById('safetyOwnerLine');
    const contact = document.getElementById('safetyContactLine');
    const ack = document.getElementById('safetyAck');
    const enter = document.getElementById('safetyEnterBtn');

    if (owner) owner.textContent = b.officeSymbol || b.productName;
    if (contact) contact.textContent = `Contact: ${b.officeName}`;

    if (ack && enter) {
      ack.addEventListener('change', () => { enter.disabled = !ack.checked; });
      enter.addEventListener('click', () => {
        if (!ack.checked) return;
        try { sessionStorage.setItem(`tccc_safety_ack_${String(window.TCCC_BUILD?.versionName||'current').replace(/[^a-z0-9]+/gi,'_')}`, '1'); } catch (_) {}
        setSafetyOpen(false);
      });
    }

    document.querySelectorAll('[data-open-safeguards]').forEach(btn => {
      btn.addEventListener('click', () => setSafetyOpen(true));
    });

    let acknowledged = false;
    try { acknowledged = sessionStorage.getItem(`tccc_safety_ack_${String(window.TCCC_BUILD?.versionName||'current').replace(/[^a-z0-9]+/gi,'_')}`) === '1'; } catch (_) {}
    setSafetyOpen(!acknowledged);
  }

  function renderBranding() {
    const b = window.TCCC_BRANDING;
    document.title = b.productName;

    document.querySelectorAll('[data-brand-product]').forEach(el => { el.textContent = b.productName; });
    document.querySelectorAll('[data-brand-office]').forEach(el => { el.textContent = meaningful(b.officeName) ? b.officeName : 'Office contact not yet configured'; });

    const officeBits = [b.officeName, b.officeSymbol].filter(meaningful);
    const contactBits = [`Contact: ${esc(b.officeName)}`];
    if (meaningful(b.website)) contactBits.push(`<a href="${esc(b.website)}" target="_blank" rel="noopener">Office website</a>`);

    document.querySelectorAll('[data-brand-footer]').forEach(el => {
      el.innerHTML = `<div class="ownershipTitle">${esc(b.productName)}</div>
        <div>${officeBits.length ? esc(officeBits.join(' · ')) : 'Program office information pending'}</div>
        <div>${contactBits.length ? contactBits.join(' · ') : 'Support contact pending'}</div>
        <div class="brandFooterActions">
          <button type="button" class="brandAboutLink" data-open-branding>About / Ownership / Contact</button>
          <button type="button" class="brandAboutLink" data-open-safeguards>Safety / Data Use</button>
        </div>`;
    });

    const modalBody = document.getElementById('brandingModalBody');
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="ownershipPanel">
          <h3>${esc(b.attributionLabel)}</h3>
          <dl class="ownershipGrid">
            <dt>Application</dt><dd>${esc(b.productName)}</dd>
            <dt>Contact</dt><dd>${meaningful(b.officeName) ? esc(b.officeName) : '<em>Not configured</em>'}</dd>
            <dt>Office / Program</dt><dd>${meaningful(b.officeSymbol) ? esc(b.officeSymbol) : '<em>Not configured</em>'}</dd>
          </dl>
          <p>${esc(b.ownershipNotice)}</p>
          <p class="dataWarning"><strong>Data handling:</strong> ${esc(b.dataNotice)}</p>
          <p class="ownershipFinePrint">This application is a training/evaluation support tool and is not a substitute for current official TCCC guidance, clinical judgment, operational casualty documentation, or locally required records.</p>
          <p class="ownershipFinePrint">${esc(b.copyrightLine)}</p>
        </div>`;
    }

    document.querySelectorAll('[data-open-branding]').forEach(btn => {
      btn.addEventListener('click', () => { const m=document.getElementById('brandingModal'); if(!m)return; m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('modalOpen');setTimeout(()=>m.querySelector('button')?.focus(),20); });
    });

    setupSafetySplash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderBranding);
  else renderBranding();
})();
