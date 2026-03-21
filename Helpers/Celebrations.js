const celebrate = (message = 'Submitted Successfully!') => {
  // Confetti burst
  if (typeof confetti === 'function') {
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ['#f5b700', '#2d2d2d', '#ffffff'] });
  }
  // Branded SweetAlert
  swal.fire({
    title: 'Done!',
    text: message,
    icon: 'success',
    confirmButtonText: 'Continue',
  }).then((result) => {
    if (result.isConfirmed) {
      window.location.href = '/Pages/reporting/reporting.html';
    }
  });
};
