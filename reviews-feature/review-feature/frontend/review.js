// Change this if your backend runs somewhere other than localhost:5000
const API_BASE = 'http://localhost:5000/api';

const state = {
  token: localStorage.getItem('ll_token') || null,
  userId: localStorage.getItem('ll_userId') || null,
  role: localStorage.getItem('ll_role') || null,
  foodId: null,
};

const foodSelect = document.getElementById('foodSelect');
const ratingTicket = document.getElementById('ratingTicket');
const reviewsList = document.getElementById('reviewsList');
const reviewFormWrap = document.getElementById('reviewFormWrap');
const reviewForm = document.getElementById('reviewForm');
const starsInput = document.getElementById('starsInput');
const commentInput = document.getElementById('commentInput');
const formError = document.getElementById('formError');
const sessionStatus = document.getElementById('sessionStatus');
const logoutBtn = document.getElementById('logoutBtn');

init();

async function init() {
  bindSessionControls();
  bindStarsInput();
  bindReviewForm();
  renderSessionStatus();
  await loadFoods();
  if (foodSelect.value) {
    state.foodId = foodSelect.value;
    await loadReviews();
  }
  foodSelect.addEventListener('change', async () => {
    state.foodId = foodSelect.value;
    await loadReviews();
  });
}

// ---------- Session (login stand-in) ----------

function bindSessionControls() {
  document.querySelectorAll('[data-role]').forEach((btn) => {
    btn.addEventListener('click', () => loginAs(btn.dataset.role));
  });
  logoutBtn.addEventListener('click', logout);
}

async function loginAs(role) {
  try {
    const res = await fetch(`${API_BASE}/dev/dev-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    state.token = data.token;
    state.userId = data.id;
    state.role = data.role;
    localStorage.setItem('ll_token', data.token);
    localStorage.setItem('ll_userId', data.id);
    localStorage.setItem('ll_role', data.role);
    renderSessionStatus();
    await loadReviews();
  } catch (err) {
    console.error(err);
    alert('Could not log in. Is the backend running on ' + API_BASE + '?');
  }
}

function logout() {
  state.token = null;
  state.userId = null;
  state.role = null;
  localStorage.removeItem('ll_token');
  localStorage.removeItem('ll_userId');
  localStorage.removeItem('ll_role');
  renderSessionStatus();
  loadReviews();
}

function renderSessionStatus() {
  if (state.token) {
    sessionStatus.textContent = `Logged in as ${state.role} (id: ${state.userId.slice(-6)})`;
    sessionStatus.classList.add('active');
    logoutBtn.hidden = false;
  } else {
    sessionStatus.textContent = 'Not logged in';
    sessionStatus.classList.remove('active');
    logoutBtn.hidden = true;
  }
  reviewFormWrap.hidden = !(state.token && state.role === 'customer');
}

// ---------- Foods (mock data stand-in) ----------

async function loadFoods() {
  try {
    const res = await fetch(`${API_BASE}/mock/foods`);
    const foods = await res.json();
    foodSelect.innerHTML = foods
      .map((f) => `<option value="${f._id}" data-merchant="${f.merchantId}">${f.name} — ${f.merchantName}</option>`)
      .join('');
    if (foods.length) state.foodId = foods[0]._id;
  } catch (err) {
    console.error(err);
    foodSelect.innerHTML = '<option>Could not load dishes — is the backend running?</option>';
  }
}

function currentMerchantId() {
  const opt = foodSelect.selectedOptions[0];
  return opt ? opt.dataset.merchant : null;
}

// ---------- Reviews ----------

async function loadReviews() {
  if (!state.foodId) return;
  try {
    const res = await fetch(`${API_BASE}/reviews/food/${state.foodId}`);
    const data = await res.json();
    renderTicket(data.averageRating, data.totalReviews);
    renderReviews(data.reviews);
  } catch (err) {
    console.error(err);
    ratingTicket.innerHTML = '<p class="empty-state">Could not load reviews — is the backend running?</p>';
  }
}

function renderTicket(average, total) {
  const fullStars = Math.round(average);
  ratingTicket.innerHTML = `
    <div class="ticket-stamp">Order Stub</div>
    <div class="ticket-top">
      <span class="ticket-score">${total ? average.toFixed(1) : '—'}</span>
      <span class="ticket-meta">out of 5 · ${total} review${total === 1 ? '' : 's'}</span>
    </div>
    <div class="ticket-stars">${starString(fullStars)}</div>
  `;
}

function renderReviews(reviews) {
  if (!reviews.length) {
    reviewsList.innerHTML = '<p class="empty-state">No reviews yet for this dish. Be the first to say something.</p>';
    return;
  }

  reviewsList.innerHTML = reviews.map((r) => reviewCardHTML(r)).join('');

  reviews.forEach((r) => {
    const card = document.getElementById(`review-${r._id}`);
    if (!card) return;

    const deleteBtn = card.querySelector('.js-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => deleteReview(r._id));

    const replyForm = card.querySelector('.js-reply-form');
    if (replyForm) {
      replyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = replyForm.querySelector('input');
        replyToReview(r._id, input.value);
      });
    }
  });
}

function reviewCardHTML(r) {
  const isOwner = state.userId && r.userId === state.userId;
  const isMerchantOwner = state.role === 'merchant' && state.userId === r.merchantId;
  const date = new Date(r.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

  return `
    <article class="review-card" id="review-${r._id}">
      <div class="review-card-top">
        <span class="review-stars">${starString(r.rating)}</span>
        <span class="review-date">${date}</span>
      </div>
      ${r.comment ? `<p class="review-comment">${escapeHTML(r.comment)}</p>` : ''}
      ${r.verifiedPurchase ? '<span class="verified-badge">Verified order</span>' : ''}
      ${
        isOwner
          ? `<div class="review-actions"><button class="btn btn-small btn-danger js-delete">Delete</button></div>`
          : ''
      }
      ${
        r.merchantReply
          ? `<div class="merchant-reply"><strong>Merchant reply:</strong> ${escapeHTML(r.merchantReply.text)}</div>`
          : isMerchantOwner
          ? `<form class="reply-form js-reply-form">
               <input type="text" maxlength="500" placeholder="Reply to this review..." required />
               <button type="submit" class="btn btn-small btn-ghost">Reply</button>
             </form>`
          : ''
      }
    </article>
  `;
}

function starString(n) {
  const full = '★'.repeat(Math.max(0, Math.min(5, n)));
  const empty = '☆'.repeat(5 - Math.max(0, Math.min(5, n)));
  return full + empty;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Review form ----------

function bindStarsInput() {
  starsInput.querySelectorAll('.star').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = parseInt(btn.dataset.value);
      starsInput.dataset.value = value;
      starsInput.querySelectorAll('.star').forEach((s) => {
        s.classList.toggle('filled', parseInt(s.dataset.value) <= value);
      });
    });
  });
}

function bindReviewForm() {
  reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';

    const rating = parseInt(starsInput.dataset.value);
    if (!rating) {
      formError.textContent = 'Pick a star rating first.';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({
          foodId: state.foodId,
          merchantId: currentMerchantId(),
          rating,
          comment: commentInput.value.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        formError.textContent = data.message || 'Could not post review.';
        return;
      }

      commentInput.value = '';
      starsInput.dataset.value = 0;
      starsInput.querySelectorAll('.star').forEach((s) => s.classList.remove('filled'));
      await loadReviews();
    } catch (err) {
      console.error(err);
      formError.textContent = 'Could not reach the server.';
    }
  });
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await fetch(`${API_BASE}/reviews/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${state.token}` },
    });
    await loadReviews();
  } catch (err) {
    console.error(err);
  }
}

async function replyToReview(id, text) {
  if (!text.trim()) return;
  try {
    await fetch(`${API_BASE}/reviews/${id}/reply`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ text }),
    });
    await loadReviews();
  } catch (err) {
    console.error(err);
  }
}
