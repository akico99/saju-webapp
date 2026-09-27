(function bindFieldGuideForm() {
  'use strict';

  const form = document.getElementById('fieldGuideForm');
  if (!form) return;

  const submitButton = document.getElementById('fieldGuideSubmit');
  const errorBox = document.getElementById('fieldGuideError');
  const result = document.getElementById('fieldGuideResult');
  const shareActions = window.FieldGuideShare.bind({
    actions: document.getElementById('fieldGuideActions'),
    saveButton: document.getElementById('fieldGuideImageSave'),
    shareButton: document.getElementById('fieldGuideLinkShare'),
    status: document.getElementById('fieldGuideShareStatus'),
    getReport: () => result.querySelector('.fg-report'),
  });
  const unknownHour = form.elements.hourUnknown;
  const hourFields = [form.elements.hour, form.elements.minute];

  function updateHourFields() {
    hourFields.forEach((field) => {
      field.disabled = unknownHour.checked;
      if (unknownHour.checked) field.value = '';
    });
  }

  unknownHour.addEventListener('change', updateHourFields);
  // 저장된 인물을 고르면 공용 위젯이 값을 채운다. 시각 모름 체크는 이벤트 없이 바뀌므로
  // 폼까지 올라온 change 이벤트에서 시각 칸 잠금 상태를 다시 맞춘다.
  form.addEventListener('change', (event) => {
    if (event.target.classList.contains('profile-picker-select')) updateHourFields();
  });
  if (window.ProfilePicker) {
    window.ProfilePicker.mount(document.getElementById('profilePicker'), form, { placeholder: '직접 입력할게' });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    submitButton.disabled = true;
    submitButton.textContent = '도감을 만드는 중…';

    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());
    body.hourUnknown = unknownHour.checked;
    body.name = typeof body.name === 'string' ? body.name.trim().slice(0, 10) : '';

    try {
      const response = await fetch('/api/field-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '사주 도감을 만들지 못했어.');
      window.renderFieldGuide(payload.guide, result);
      shareActions.show();
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      errorBox.textContent = error.message || '요청에 실패했어. 잠시 뒤 다시 시도해줘.';
      errorBox.classList.remove('hidden');
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '무료로 도감 만들기';
    }
  });
}());
