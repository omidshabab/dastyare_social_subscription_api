const { useState, useEffect, useRef } = React;

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

function AuthApp() {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [subs, setSubs] = useState([]);
  const [resendTimer, setResendTimer] = useState(0);
  const phoneInputRef = useRef(null);
  const otpInputRef = useRef(null);

  useEffect(() => {
    const apiKey = getCookie("api_key");
    if (apiKey) {
      setStep(3);
      refreshDashboard(apiKey);
      return;
    }
    const savedStep = Number(sessionStorage.getItem("auth_step") || "1");
    const savedPhone = sessionStorage.getItem("auth_phone") || "";
    if (savedStep === 2 && savedPhone) {
      setPhone(savedPhone);
      setStep(2);
      setResendTimer(60);
    } else {
      setStep(1);
    }
  }, []);

  useEffect(() => {
    if (step !== 3) {
      history.pushState(null, "", location.href);
      window.onpopstate = () => {
        history.pushState(null, "", location.href);
      };
    } else {
      window.onpopstate = null;
    }
  }, [step]);

  useEffect(() => {
    let id = null;
    if (step === 2 && resendTimer > 0) {
      id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    }
    return () => {
      if (id) clearInterval(id);
    };
  }, [step, resendTimer]);

  useEffect(() => {
    if (step === 1 && phoneInputRef.current) {
      phoneInputRef.current.focus();
    }
    if (step === 2 && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  function validatePhone(value) {
    const v = normalizePhone(value);
    const ok = /^\+[1-9]\d{6,14}$/.test(v);
    setPhoneError(ok ? "" : "فرمت بین‌المللی لازم است مانند +98912xxxxxxx");
    return ok;
  }

  function handlePhoneChange(e) {
    const v = e.target.value;
    setPhone(v);
    validatePhone(v);
  }

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    const ok = validatePhone(phone);
    if (!ok) return;
    setMsg("در حال بررسی شماره...");
    setLoading(true);
    try {
      await requestOtp(normalizePhone(phone));
      setMsg("کد ارسال شد");
      sessionStorage.setItem("auth_step", "2");
      sessionStorage.setItem("auth_phone", normalizePhone(phone));
      setStep(2);
      setResendTimer(60);
    } catch (err) {
      setMsg(err.message || "خطا در ارسال کد");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(e) {
    const raw = e.target.value;
    const digits = toLatinDigits(raw).replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    setOtpError(digits.length === 6 ? "" : "کد شش‌رقمی لازم است");
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    if (otp.length !== 6) {
      setOtpError("کد شش‌رقمی لازم است");
      return;
    }
    const p = sessionStorage.getItem("auth_phone") || normalizePhone(phone);
    setMsg("در حال تایید کد...");
    setLoading(true);
    try {
      const result = await verifyOtp(p, otp);
      if (result.apiKey) {
        setCookie("api_key", result.apiKey);
        sessionStorage.setItem("auth_step", "3");
        setStep(3);
        setMsg("ورود موفق");
        await refreshDashboard(result.apiKey);
      }
    } catch (err) {
      setMsg(err.message || "کد تأیید نامعتبر است");
    } finally {
      setLoading(false);
    }
  }

  async function refreshDashboard(apiKey) {
    try {
      const creditInfo = document.getElementById("credit-info");
      const btnLogout = document.getElementById("btn-logout");
      const sidebar = document.getElementById("sidebar");
      const subscriptionList = document.getElementById("subscription-list");
      const data = await fetchSubscriptions(apiKey);
      setSubs(data || []);
      if (creditInfo) {
        creditInfo.classList.remove("hidden");
        creditInfo.textContent = "ورود انجام شد";
      }
      if (btnLogout) {
        btnLogout.classList.remove("hidden");
        btnLogout.onclick = () => {
          clearCookie("api_key");
          sessionStorage.clear();
          location.reload();
        };
      }
      if (sidebar && subscriptionList) {
        sidebar.classList.remove("hidden");
        subscriptionList.innerHTML = "";
        if (!data || data.length === 0) {
          const li = document.createElement("li");
          li.className = "ls-2";
          li.textContent = "اشتراک فعالی یافت نشد.";
          subscriptionList.appendChild(li);
        } else {
          data.forEach((s) => {
            const status = s.status || "";
            const plan = s.plan?.name || "";
            const li = document.createElement("li");
            li.className = "ls-2";
            li.textContent = `${plan} — ${status}`;
            subscriptionList.appendChild(li);
          });
        }
      }
    } catch (err) {
      setMsg(err.message || "عدم امکان دریافت اشتراک‌ها");
    }
  }

  async function handleResend() {
    if (resendTimer > 0 || loading) return;
    const p = sessionStorage.getItem("auth_phone") || normalizePhone(phone);
    setMsg("ارسال مجدد کد...");
    setLoading(true);
    try {
      await requestOtp(p);
      setResendTimer(60);
      setMsg("کد مجدداً ارسال شد");
    } catch (err) {
      setMsg(err.message || "خطا در ارسال مجدد کد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="view">
      <div className="steps">
        <div className={`step-item ls-3 ${step === 1 ? "current" : ""}`}>ورود با موبایل</div>
        <div className={`step-item ls-3 ${step === 2 ? "current" : ""}`}>تایید کد</div>
        <div className={`step-item ls-3 ${step === 3 ? "current" : ""}`}>داشبورد</div>
      </div>
      {step === 1 && (
        <section className="step">
          <form className="form" onSubmit={handlePhoneSubmit}>
            <label className="ls-3">شماره موبایل</label>
            <input
              ref={phoneInputRef}
              className="input input-lg"
              type="tel"
              inputMode="numeric"
              dir="ltr"
              placeholder="+98912xxxxxxx"
              value={phone}
              onChange={handlePhoneChange}
            />
            {phoneError && <div className="error-text ls-2">{phoneError}</div>}
            <button className="btn-primary btn-lg ls-2" type="submit" disabled={!!phoneError || loading}>
              تایید شماره
              {loading && <span className="spinner" style={{ marginInlineStart: 8 }}></span>}
            </button>
            <div className="hint ls-2">کد شش‌رقمی برای شما پیامک می‌شود.</div>
          </form>
        </section>
      )}
      {step === 2 && (
        <section className="step">
          <div className="muted ls-2">کد ارسال شده برای {sessionStorage.getItem("auth_phone") || phone}</div>
          <form className="form" onSubmit={handleOtpSubmit}>
            <label className="ls-3">کد تایید</label>
            <input
              ref={otpInputRef}
              className="input input-lg"
              type="text"
              inputMode="numeric"
              maxLength="6"
              dir="ltr"
              placeholder="******"
              value={otp}
              onChange={handleOtpChange}
            />
            {otpError && <div className="error-text ls-2">{otpError}</div>}
            <button className="btn-primary btn-lg ls-2" type="submit" disabled={otp.length !== 6 || loading}>
              تایید کد
              {loading && <span className="spinner" style={{ marginInlineStart: 8 }}></span>}
            </button>
            <button
              className="btn-secondary ls-2"
              type="button"
              disabled={resendTimer > 0 || loading}
              onClick={handleResend}
              style={{ marginTop: "8px" }}
            >
              ارسال دوباره کد {resendTimer > 0 ? `(${resendTimer}s)` : ""}
            </button>
          </form>
        </section>
      )}
      {step === 3 && (
        <section className="step">
          <h2 className="ls-3">خانه</h2>
          <div className="lead ls-2">وضعیت و اشتراک‌های فعال شما در این بخش نمایش داده می‌شود.</div>
          <div className="panel">
            <h3 className="ls-3">اشتراک‌ها</h3>
            <ul className="list">
              {subs && subs.length > 0 ? (
                subs.map((s, i) => {
                  const status = s.status || "";
                  const plan = (s.plan && s.plan.name) || "";
                  return (
                    <li key={i} className="ls-2">
                      {plan} — {status}
                    </li>
                  );
                })
              ) : (
                <li className="ls-2">اشتراک فعالی یافت نشد.</li>
              )}
            </ul>
          </div>
        </section>
      )}
      <div className="msg ls-2">{msg}</div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AuthApp />);
