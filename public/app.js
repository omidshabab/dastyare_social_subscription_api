document.addEventListener("DOMContentLoaded", () => {
  const phoneInput = document.getElementById("phone");
  const otpInput = document.getElementById("otp");
  const msg = document.getElementById("msg");
  const btnSendOtp = document.getElementById("btn-send-otp");
  const btnVerifyOtp = document.getElementById("btn-verify-otp");
  const btnLogout = document.getElementById("btn-logout");
  const creditInfo = document.getElementById("credit-info");
  const stepPhone = document.getElementById("step-phone");
  const stepOtp = document.getElementById("step-otp");
  const stepHome = document.getElementById("step-home");
  const subscriptionList = document.getElementById("subscription-list");
  const subscriptionsUl = document.getElementById("subscriptions");
  const sidebar = document.getElementById("sidebar");
  let pendingPhone = "";

  function toLatinDigits(s) {
    const persian = "۰۱۲۳۴۵۶۷۸۹";
    const arabic = "٠١٢٣٤٥٦٧٨٩";
    return String(s)
      .split("")
      .map((ch) => {
        const pi = persian.indexOf(ch);
        if (pi > -1) return String(pi);
        const ai = arabic.indexOf(ch);
        if (ai > -1) return String(ai);
        return ch;
      })
      .join("");
  }

  function normalizePhone(raw) {
    const s = toLatinDigits(raw).replace(/[^\d+]/g, "");
    return s;
  }

  function setMsg(text, tone = "info") {
    msg.textContent = text || "";
    msg.style.color = tone === "error" ? "var(--orange-600)" : "var(--zinc-700)";
  }

  function setCookie(name, value, days = 30) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  }

  function getCookie(name) {
    return document.cookie.split("; ").reduce((acc, cur) => {
      const [k, v] = cur.split("=");
      if (k === name) acc = decodeURIComponent(v || "");
      return acc;
    }, "");
  }

  function clearCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  async function requestOtp(phone) {
    const res = await fetch("http://localhost:3001/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "خطا در ارسال کد");
    }
  }

  async function verifyOtp(phone, code) {
    const res = await fetch("http://localhost:3001/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "کد تأیید نامعتبر است");
    }
    return data;
  }

  async function fetchSubscriptions(apiKey) {
    const res = await fetch("http://localhost:3001/api/subscriptions/me", {
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "عدم امکان دریافت اشتراک‌ها");
    }
    return res.json();
  }

  async function refreshHome() {
    const apiKey = getCookie("api_key");
    if (!apiKey) return;
    try {
      const subs = await fetchSubscriptions(apiKey);
      subscriptionsUl.innerHTML = "";
      subscriptionList.innerHTML = "";
      if (!subs || subs.length === 0) {
        subscriptionsUl.innerHTML = `<li class="ls-2">اشتراک فعالی یافت نشد.</li>`;
      } else {
        subs.forEach((s) => {
          const status = s.status || "";
          const plan = s.plan?.name || "";
          const li = document.createElement("li");
          li.className = "ls-2";
          li.textContent = `${plan} — ${status}`;
          subscriptionsUl.appendChild(li);

          const sli = document.createElement("li");
          sli.className = "ls-2";
          sli.textContent = `${plan} — ${status}`;
          subscriptionList.appendChild(sli);
        });
      }
      creditInfo.classList.remove("hidden");
      creditInfo.textContent = "ورود انجام شد";
      btnLogout.classList.remove("hidden");
      sidebar.classList.remove("hidden");
      stepHome.classList.remove("hidden");
      stepPhone.classList.add("hidden");
      stepOtp.classList.add("hidden");
    } catch (err) {
      setMsg(err.message, "error");
    }
  }

  // Initialize by checking cookie and showing proper step
  (function init() {
    const apiKey = getCookie("api_key");
    if (apiKey) {
      refreshHome();
    } else {
      stepPhone.classList.remove("hidden");
      stepOtp.classList.add("hidden");
      stepHome.classList.add("hidden");
    }
  })();

  // Form-less click flow handlers below

  if (btnSendOtp) {
    btnSendOtp.addEventListener("click", async () => {
      const raw = phoneInput.value || "";
      const phone = normalizePhone(raw);
      if (!phone || phone.length < 10) {
        setMsg("شماره موبایل معتبر نیست", "error");
        return;
      }
      setMsg("در حال ارسال کد...");
      btnSendOtp.disabled = true;
      try {
        await requestOtp(phone);
        setMsg("کد ارسال شد. لطفاً کد را وارد کنید.");
        stepPhone.classList.add("hidden");
        stepOtp.classList.remove("hidden");
        otpInput.focus();
        pendingPhone = phone;
      } catch (err) {
        setMsg(err.message, "error");
      } finally {
        btnSendOtp.disabled = false;
      }
    });
  }

  if (btnVerifyOtp) {
    btnVerifyOtp.addEventListener("click", async () => {
      const code = toLatinDigits(otpInput.value || "").replace(/\D/g, "");
      const phone = pendingPhone || toLatinDigits(phoneInput.value || "");
      if (!code || code.length < 4) {
        setMsg("کد تأیید معتبر نیست", "error");
        return;
      }
      setMsg("در حال ورود...");
      btnVerifyOtp.disabled = true;
      try {
        const result = await verifyOtp(phone, code);
        if (result.apiKey) {
          setCookie("api_key", result.apiKey);
          setMsg("ورود موفق");
          refreshHome();
        }
      } catch (err) {
        setMsg(err.message, "error");
      } finally {
        btnVerifyOtp.disabled = false;
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      clearCookie("api_key");
      location.reload();
    });
  }
});
