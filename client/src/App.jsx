
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";

// Production API URL from Render environment variable.
// Local development continues to use localhost.
const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

const developerNavItems = [
  { icon: "⌂", label: "Overview" },
  { icon: "▤", label: "Invoices" },
  { icon: "↗", label: "Payments" },
  { icon: "◷", label: "Customers" },
  { icon: "▥", label: "Analytics" },
];

const clientNavItems = [
  { icon: "⌂", label: "Client Portal" },
  { icon: "▤", label: "My Invoices" },
];

const suggestedQuestions = [
  "How much revenue have I collected?",
  "Show my pending invoices.",
  "Which customers have pending payments?",
  "Give me a financial summary.",
];

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function App() {
  // ------------------------------------------
  // AUTH STATES
  // ------------------------------------------

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("developer");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  // ------------------------------------------
  // PROFILE / ROLE
  // ------------------------------------------

  const [profile, setProfile] = useState(null);
  const userRole = profile?.role || "";
  const isDeveloper = userRole === "developer";
  const isClient = userRole === "client";

  // ------------------------------------------
  // APP STATES
  // ------------------------------------------

  const [invoices, setInvoices] = useState([]);
  const [activePage, setActivePage] = useState("Overview");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [payingInvoice, setPayingInvoice] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");

  // ------------------------------------------
  // HEADER / PROFILE MENUS
  // ------------------------------------------

  const [openMenu, setOpenMenu] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  const [form, setForm] = useState({
    client: "",
    email: "",
    amount: "",
  });

  // ------------------------------------------
  // AI CHAT
  // ------------------------------------------

  const [aiMessages, setAiMessages] = useState([
    {
      role: "model",
      content:
        "Hello! I'm PayFlow AI, your intelligent business assistant. I can help you understand your invoices, payments and financial performance. What would you like to know?",
    },
  ]);

  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // ------------------------------------------
  // SETTINGS
  // ------------------------------------------

  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("payflow_settings")) || {
        businessName: "Your Business",
        email: "",
        currency: "USD",
        notifications: true,
      };
    } catch {
      return {
        businessName: "Your Business",
        email: "",
        currency: "USD",
        notifications: true,
      };
    }
  });

  const [settingsMessage, setSettingsMessage] = useState("");

  // ------------------------------------------
  // SUPABASE SESSION LISTENER
  // ------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        setAuthError(error.message);
      }

      setSession(data?.session || null);
      setAuthReady(true);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setAuthError("");
        setAuthMessage("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------
  // API HEADERS
  // ------------------------------------------

  async function getApiHeaders(json = true) {
    const headers = {};

    if (json) {
      headers["Content-Type"] = "application/json";
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  // ------------------------------------------
  // LOAD PROFILE
  // ------------------------------------------

  async function fetchProfile() {
    const response = await fetch(`${API_URL}/api/profile`, {
      headers: await getApiHeaders(false),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load account profile.");
    }

    if (
      !data.profile ||
      !["developer", "client"].includes(data.profile.role)
    ) {
      throw new Error("Your account role is missing or invalid.");
    }

    setProfile(data.profile);

    return data.profile;
  }

  // ------------------------------------------
  // LOAD INVOICES
  // ------------------------------------------

  async function fetchInvoices() {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/invoices`, {
        headers: await getApiHeaders(false),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load invoices.");
      }

      setInvoices(data.invoices || []);
      setApiError("");
    } catch (error) {
      setApiError(error.message || "Backend connection failed.");
      throw error;
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------
  // LOAD PROFILE FIRST, THEN INVOICES
  // ------------------------------------------

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function loadWorkspace() {
      if (!session) {
        setProfile(null);
        setInvoices([]);
        setLoading(false);
        setActivePage("Overview");
        return;
      }

      try {
        setLoading(true);
        setApiError("");

        const loadedProfile = await fetchProfile();

        if (cancelled) return;

        if (loadedProfile.role === "client") {
          setActivePage("Client Portal");
        } else {
          setActivePage("Overview");
        }

        setSettings((previous) => ({
          ...previous,
          email: previous.email || session.user.email || "",
        }));

        await fetchInvoices();
      } catch (error) {
        if (!cancelled) {
          setApiError(error.message || "Unable to load your workspace.");
          setLoading(false);
        }
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [session, authReady]);

  // ------------------------------------------
  // SIGN UP / LOGIN
  // ------------------------------------------

  async function handleAuthSubmit(event) {
    event.preventDefault();

    setAuthError("");
    setAuthMessage("");

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;

    if (!email || !password) {
      setAuthError("Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Password must contain at least 6 characters.");
      return;
    }

    if (
      authMode === "signup" &&
      !["developer", "client"].includes(selectedRole)
    ) {
      setAuthError("Please select a valid account type.");
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: selectedRole,
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          setAuthMessage("Account created successfully!");
        } else {
          setAuthMessage(
            "Account created successfully. Please check your email and confirm your account before logging in."
          );
          setAuthMode("login");
          setAuthPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setAuthMessage("Login successful!");
      }
    } catch (error) {
      setAuthError(error.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  // ------------------------------------------
  // LOGOUT
  // ------------------------------------------

  async function handleLogout() {
    setOpenMenu("");
    setShowNotifications(false);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setProfile(null);
      setInvoices([]);
      setActivePage("Overview");
      setSearch("");
      setPaymentMessage("");
      setApiError("");
      setAiError("");
      setAiInput("");
      setShowModal(false);
    } catch (error) {
      setApiError(error.message || "Unable to logout.");
    }
  }

  // ------------------------------------------
  // PAYPAL RETURN AND CAPTURE
  // ------------------------------------------

  useEffect(() => {
    if (!authReady || !session || !isClient) return;

    const params = new URLSearchParams(window.location.search);
    const orderID = params.get("token");
    const pathname = window.location.pathname;

    if (pathname === "/payment-cancel") {
      setPaymentMessage(
        "Payment was cancelled. Your invoice is still pending."
      );

      sessionStorage.removeItem("payflow_invoice_number");
      window.history.replaceState(null, "", "/");
      return;
    }

    if (pathname === "/payment-success" && orderID) {
      const invoiceNumber = sessionStorage.getItem(
        "payflow_invoice_number"
      );

      if (!invoiceNumber) {
        setApiError("Invoice reference not found.");
        window.history.replaceState(null, "", "/");
        return;
      }

      const captureKey = `payflow_capture_${orderID}`;

      if (sessionStorage.getItem(captureKey) === "started") return;

      sessionStorage.setItem(captureKey, "started");

      async function capturePayment() {
        try {
          setPaymentMessage("Verifying your PayPal payment...");

          const response = await fetch(
            `${API_URL}/api/paypal/capture-order`,
            {
              method: "POST",
              headers: await getApiHeaders(),
              body: JSON.stringify({
                orderID,
                invoiceNumber,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.message || "Payment verification failed."
            );
          }

          setPaymentMessage(
            `Payment successful! Invoice ${invoiceNumber} is now Paid.`
          );

          sessionStorage.removeItem("payflow_invoice_number");
          await fetchInvoices();
        } catch (error) {
          sessionStorage.removeItem(captureKey);
          setApiError(error.message);
          setPaymentMessage("");
        } finally {
          window.history.replaceState(null, "", "/");
        }
      }

      capturePayment();
    }
  }, [authReady, session, isClient]);

  // ------------------------------------------
  // GEMINI AI CHAT
  // ------------------------------------------

  async function sendAIMessage(customMessage) {
    const message = (
      typeof customMessage === "string" ? customMessage : aiInput
    ).trim();

    if (!message || aiLoading || !isDeveloper) return;

    const previousHistory = aiMessages.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setAiMessages((previous) => [
      ...previous,
      { role: "user", content: message },
    ]);

    setAiInput("");
    setAiError("");
    setAiLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: await getApiHeaders(),
        body: JSON.stringify({
          message,
          history: previousHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to get AI response.");
      }

      if (!data.reply) {
        throw new Error("AI response was empty.");
      }

      setAiMessages((previous) => [
        ...previous,
        { role: "model", content: data.reply },
      ]);
    } catch (error) {
      setAiError(error.message);
    } finally {
      setAiLoading(false);
    }
  }

  function clearAIChat() {
    setAiMessages([
      {
        role: "model",
        content:
          "Hello! I'm PayFlow AI. Ask me anything about your invoices, payments and business performance.",
      },
    ]);

    setAiError("");
    setAiInput("");
  }

  // ------------------------------------------
  // SAVE SETTINGS
  // ------------------------------------------

  function saveSettings(event) {
    event.preventDefault();

    localStorage.setItem(
      "payflow_settings",
      JSON.stringify(settings)
    );

    setSettingsMessage("Settings saved on this device successfully.");

    setTimeout(() => setSettingsMessage(""), 3000);
  }

  // ------------------------------------------
  // FINANCIAL CALCULATIONS
  // ------------------------------------------

  const paidInvoices = invoices.filter(
    (invoice) => invoice.status === "Paid"
  );

  const pendingInvoices = invoices.filter(
    (invoice) =>
      invoice.status === "Pending" ||
      invoice.status === "Overdue"
  );

  const paidTotal = paidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount),
    0
  );

  const pendingTotal = pendingInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount),
    0
  );

  const overdueInvoices = invoices.filter(
    (invoice) => invoice.status === "Overdue"
  );

  // ------------------------------------------
  // CUSTOMERS - DEVELOPER DATA
  // ------------------------------------------

  const customers = useMemo(() => {
    const customerMap = new Map();

    invoices.forEach((invoice) => {
      const key = (
        invoice.email ||
        invoice.client ||
        ""
      ).toLowerCase();

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: invoice.client,
          email: invoice.email,
          totalInvoices: 0,
          totalAmount: 0,
          paidAmount: 0,
        });
      }

      const customer = customerMap.get(key);

      customer.totalInvoices += 1;
      customer.totalAmount += Number(invoice.amount);

      if (invoice.status === "Paid") {
        customer.paidAmount += Number(invoice.amount);
      }
    });

    return Array.from(customerMap.values());
  }, [invoices]);

  // ------------------------------------------
  // SEARCH
  // ------------------------------------------

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invoices.filter((invoice) =>
      `${invoice.id} ${invoice.invoice_number || ""} ${invoice.client} ${invoice.email} ${invoice.status}`
        .toLowerCase()
        .includes(query)
    );
  }, [invoices, search]);

  const filteredCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.email}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  // ------------------------------------------
  // CREATE INVOICE - DEVELOPER ONLY
  // ------------------------------------------

  async function addInvoice(event) {
    event.preventDefault();

    if (!isDeveloper) {
      setApiError("Only Developer accounts can create invoices.");
      return;
    }

    setSaving(true);
    setApiError("");

    try {
      const response = await fetch(`${API_URL}/api/invoices`, {
        method: "POST",
        headers: await getApiHeaders(),
        body: JSON.stringify({
          client: form.client.trim(),
          email: form.email.trim(),
          amount: Number(form.amount),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invoice creation failed.");
      }

      await fetchInvoices();

      setForm({
        client: "",
        email: "",
        amount: "",
      });

      setShowModal(false);
      setActivePage("Invoices");
      setSearch("");
    } catch (error) {
      setApiError(error.message);
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------
  // PAYPAL PAYMENT - CLIENT ONLY
  // ------------------------------------------

  async function startPayPalPayment(invoice) {
    if (!isClient) {
      setApiError("Only Client accounts can pay invoices.");
      return;
    }

    setPayingInvoice(invoice.id);
    setApiError("");
    setPaymentMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/paypal/create-order`,
        {
          method: "POST",
          headers: await getApiHeaders(),
          body: JSON.stringify({
            invoiceNumber: invoice.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to create PayPal order."
        );
      }

      if (!data.approvalUrl) {
        throw new Error("PayPal approval URL not received.");
      }

      sessionStorage.setItem(
        "payflow_invoice_number",
        invoice.id
      );

      window.location.href = data.approvalUrl;
    } catch (error) {
      setApiError(error.message);
      setPayingInvoice("");
    }
  }

  // ------------------------------------------
  // PAGE HELPERS
  // ------------------------------------------

  const pageTitle =
    activePage === "Overview"
      ? "Dashboard Overview"
      : activePage;

  function PageHeader({ description }) {
    return (
      <div className="welcome-row">
        <div>
          <p className="eyebrow">
            {isClient ? "PAYFLOW AI CLIENT PORTAL" : "PAYFLOW AI WORKSPACE"}
          </p>
          <h1>{pageTitle}</h1>
          <p className="subheading">{description}</p>
        </div>

        {isDeveloper &&
          (activePage === "Overview" ||
            activePage === "Invoices") && (
            <button
              className="primary-button"
              onClick={() => setShowModal(true)}
            >
              ＋ Create invoice
            </button>
          )}
      </div>
    );
  }

  // ------------------------------------------
  // INVOICE TABLE
  // ------------------------------------------

  function InvoiceTable({ data }) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>INVOICE</th>
              <th>CLIENT</th>
              <th>DATE</th>
              <th>AMOUNT</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>

          <tbody>
            {data.map((invoice) => (
              <tr key={invoice.id}>
                <td className="invoice-id">{invoice.id}</td>

                <td>
                  <strong>{invoice.client}</strong>
                  <small>{invoice.email}</small>
                </td>

                <td>{invoice.date || "—"}</td>

                <td className="amount">
                  {money(invoice.amount)}
                </td>

                <td>
                  <span
                    className={`status ${(invoice.status || "").toLowerCase()}`}
                  >
                    {invoice.status}
                  </span>
                </td>

                <td>
                  {isClient && invoice.status === "Pending" ? (
                    <button
                      className="pay-button"
                      disabled={payingInvoice === invoice.id}
                      onClick={() => startPayPalPayment(invoice)}
                    >
                      {payingInvoice === invoice.id
                        ? "Redirecting..."
                        : "Pay Now"}
                    </button>
                  ) : invoice.status === "Paid" ? (
                    <span className="paid-label">✓ Paid</span>
                  ) : isDeveloper ? (
                    <span>Awaiting client</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}

            {data.length === 0 && (
              <tr>
                <td colSpan="6" className="empty-state">
                  {isClient
                    ? "No invoices have been assigned to your account yet."
                    : "No records found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // ------------------------------------------
  // DEVELOPER OVERVIEW PAGE
  // ------------------------------------------

  function OverviewPage() {
    return (
      <>
        {PageHeader({
          description:
            "Here's what's happening with your business today.",
        })}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-top">
              <span>Total collected</span>
              <span className="stat-icon purple">＄</span>
            </div>
            <h2>{money(paidTotal)}</h2>
            <p className="stat-note">
              <span className="positive">Paid</span> amount collected
            </p>
            <div className="mini-bars">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Pending payments</span>
              <span className="stat-icon orange">◷</span>
            </div>
            <h2>{money(pendingTotal)}</h2>
            <p className="stat-note">
              <span className="orange-text">
                {pendingInvoices.length} invoices
              </span>{" "}
              awaiting payment
            </p>
            <div className="mini-bars orange-bars">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Total invoices</span>
              <span className="stat-icon blue">▤</span>
            </div>
            <h2>{invoices.length}</h2>
            <p className="stat-note">
              <span className="positive">Active</span> invoice records
            </p>
            <div className="mini-bars blue-bars">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Paid invoices</span>
              <span className="stat-icon green">✓</span>
            </div>
            <h2>{paidInvoices.length}</h2>
            <p className="stat-note">
              <span className="positive">Successfully</span> collected
            </p>
            <div className="mini-bars green-bars">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>
        </div>

        <div className="middle-grid">
          <section className="panel revenue-panel">
            <div className="panel-heading">
              <div>
                <h3>Revenue overview</h3>
                <p>Illustrative demo activity</p>
              </div>
            </div>

            <div className="chart-total">
              {money(paidTotal)} <span>collected</span>
            </div>

            <div className="chart">
              <div className="chart-y">
                <span>$3k</span>
                <span>$2k</span>
                <span>$1k</span>
                <span>$0</span>
              </div>

              <div className="chart-area">
                <div className="chart-grid">
                  <i /><i /><i /><i />
                </div>

                <svg
                  viewBox="0 0 600 190"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient
                      id="fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#7565f5"
                        stopOpacity=".25"
                      />
                      <stop
                        offset="100%"
                        stopColor="#7565f5"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>

                  <path
                    d="M0 145 C45 130 50 115 100 125 S160 85 200 105 S260 115 300 75 S360 100 400 65 S460 85 500 40 S560 65 600 18 L600 190 L0 190 Z"
                    fill="url(#fill)"
                  />

                  <path
                    d="M0 145 C45 130 50 115 100 125 S160 85 200 105 S260 115 300 75 S360 100 400 65 S460 85 500 40 S560 65 600 18"
                    fill="none"
                    stroke="#7565f5"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                <div className="chart-x">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day) => (
                      <span key={day}>{day}</span>
                    )
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h3>Payment summary</h3>
                <p>Invoice status breakdown</p>
              </div>
            </div>

            <div className="donut-wrap">
              <div className="donut">
                <div>
                  <strong>{invoices.length}</strong>
                  <span>Invoices</span>
                </div>
              </div>
            </div>

            <div className="legend">
              <div>
                <span className="legend-dot paid-dot" />
                <span>Paid</span>
                <strong>{paidInvoices.length}</strong>
              </div>
              <div>
                <span className="legend-dot pending-dot" />
                <span>Pending</span>
                <strong>
                  {invoices.filter((i) => i.status === "Pending").length}
                </strong>
              </div>
              <div>
                <span className="legend-dot overdue-dot" />
                <span>Overdue</span>
                <strong>{overdueInvoices.length}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="panel invoices-panel">
          <div className="panel-heading invoice-heading">
            <div>
              <h3>Recent invoices</h3>
              <p>Keep track of your latest transactions</p>
            </div>

            <button
              className="view-all"
              onClick={() => {
                setSearch("");
                setActivePage("Invoices");
              }}
            >
              View all →
            </button>
          </div>

          {InvoiceTable({
            data: [...invoices].slice(-5).reverse(),
          })}
        </section>
      </>
    );
  }

  // ------------------------------------------
  // CLIENT PORTAL
  // ------------------------------------------

  function ClientPortalPage() {
    return (
      <>
        {PageHeader({
          description:
            "Welcome to your Client Portal. View and pay invoices shared with your account.",
        })}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-top">
              <span>Total invoices</span>
              <span className="stat-icon blue">▤</span>
            </div>
            <h2>{invoices.length}</h2>
            <p className="stat-note">Invoices assigned to your account</p>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Amount due</span>
              <span className="stat-icon orange">◷</span>
            </div>
            <h2>{money(pendingTotal)}</h2>
            <p className="stat-note">
              {pendingInvoices.length} invoice(s) awaiting payment
            </p>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Amount paid</span>
              <span className="stat-icon green">✓</span>
            </div>
            <h2>{money(paidTotal)}</h2>
            <p className="stat-note">Successfully paid invoices</p>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Paid invoices</span>
              <span className="stat-icon purple">＄</span>
            </div>
            <h2>{paidInvoices.length}</h2>
            <p className="stat-note">Completed payments</p>
          </div>
        </div>

        <section className="panel invoices-panel">
          <div className="panel-heading invoice-heading">
            <div>
              <h3>Your recent invoices</h3>
              <p>Review your invoices and pay pending amounts securely.</p>
            </div>

            <button
              className="view-all"
              onClick={() => {
                setSearch("");
                setActivePage("My Invoices");
              }}
            >
              View all →
            </button>
          </div>

          {InvoiceTable({
            data: [...invoices].slice(0, 5),
          })}
        </section>
      </>
    );
  }

  // ------------------------------------------
  // INVOICES PAGE
  // ------------------------------------------

  function InvoicesPage() {
    return (
      <>
        {PageHeader({
          description: "Create, search and manage all your invoices.",
        })}

        <section className="panel invoices-panel">
          <div className="panel-heading invoice-heading">
            <div>
              <h3>All invoices ({invoices.length})</h3>
              <p>Complete invoice records from your database</p>
            </div>

            <input
              className="search-input"
              type="search"
              placeholder="Search invoice or customer..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {InvoiceTable({ data: filteredInvoices })}
        </section>
      </>
    );
  }

  // ------------------------------------------
  // CLIENT MY INVOICES PAGE
  // ------------------------------------------

  function MyInvoicesPage() {
    return (
      <>
        {PageHeader({
          description:
            "View all invoices assigned to your account and complete pending payments.",
        })}

        <section className="panel invoices-panel">
          <div className="panel-heading invoice-heading">
            <div>
              <h3>My invoices ({invoices.length})</h3>
              <p>Your invoices are linked to your verified email address.</p>
            </div>

            <input
              className="search-input"
              type="search"
              placeholder="Search my invoices..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {InvoiceTable({ data: filteredInvoices })}
        </section>
      </>
    );
  }

  // ------------------------------------------
  // PAYMENTS PAGE
  // ------------------------------------------

  function PaymentsPage() {
    return (
      <>
        {PageHeader({
          description:
            "Track successful and pending PayPal transactions.",
        })}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total collected</h3>
            <h2>{money(paidTotal)}</h2>
          </div>

          <div className="stat-card">
            <h3>Pending amount</h3>
            <h2>{money(pendingTotal)}</h2>
          </div>

          <div className="stat-card">
            <h3>Successful payments</h3>
            <h2>{paidInvoices.length}</h2>
          </div>

          <div className="stat-card">
            <h3>Pending payments</h3>
            <h2>{pendingInvoices.length}</h2>
          </div>
        </div>

        <section className="panel invoices-panel">
          <div className="panel-heading">
            <div>
              <h3>Payment records</h3>
              <p>Payments are based on invoice status.</p>
            </div>
          </div>

          {InvoiceTable({
            data: invoices.filter(
              (i) =>
                i.status === "Paid" ||
                i.status === "Pending"
            ),
          })}
        </section>
      </>
    );
  }

  // ------------------------------------------
  // CUSTOMERS PAGE
  // ------------------------------------------

  function CustomersPage() {
    return (
      <>
        {PageHeader({
          description:
            "View customers created through your invoices.",
        })}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total customers</h3>
            <h2>{customers.length}</h2>
          </div>

          <div className="stat-card">
            <h3>Customer invoices</h3>
            <h2>{invoices.length}</h2>
          </div>

          <div className="stat-card">
            <h3>Customer payments</h3>
            <h2>{money(paidTotal)}</h2>
          </div>

          <div className="stat-card">
            <h3>Outstanding amount</h3>
            <h2>{money(pendingTotal)}</h2>
          </div>
        </div>

        <section className="panel invoices-panel">
          <div className="panel-heading invoice-heading">
            <div>
              <h3>Customers ({customers.length})</h3>
              <p>Customers are grouped by email address.</p>
            </div>

            <input
              className="search-input"
              type="search"
              placeholder="Search customers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CUSTOMER</th>
                  <th>EMAIL</th>
                  <th>INVOICES</th>
                  <th>TOTAL AMOUNT</th>
                  <th>PAID AMOUNT</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.email}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.email}</td>
                    <td>{customer.totalInvoices}</td>
                    <td>{money(customer.totalAmount)}</td>
                    <td>{money(customer.paidAmount)}</td>
                  </tr>
                ))}

                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-state">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  // ------------------------------------------
  // ANALYTICS PAGE
  // ------------------------------------------

  function AnalyticsPage() {
    const paidPercentage = invoices.length
      ? Math.round(
          (paidInvoices.length / invoices.length) * 100
        )
      : 0;

    const pendingPercentage = invoices.length
      ? (pendingInvoices.length / invoices.length) * 100
      : 0;

    const averageInvoice = invoices.length
      ? invoices.reduce(
          (sum, invoice) => sum + Number(invoice.amount),
          0
        ) / invoices.length
      : 0;

    return (
      <>
        {PageHeader({
          description:
            "Understand your business performance using invoice data.",
        })}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total revenue</h3>
            <h2>{money(paidTotal)}</h2>
          </div>

          <div className="stat-card">
            <h3>Outstanding revenue</h3>
            <h2>{money(pendingTotal)}</h2>
          </div>

          <div className="stat-card">
            <h3>Payment success rate</h3>
            <h2>{paidPercentage}%</h2>
          </div>

          <div className="stat-card">
            <h3>Average invoice value</h3>
            <h2>{money(averageInvoice)}</h2>
          </div>
        </div>

        <section className="panel invoices-panel">
          <div className="panel-heading">
            <div>
              <h3>Business performance</h3>
              <p>Calculated from current invoice records.</p>
            </div>
          </div>

          <div className="performance-content">
            <p>
              Paid invoices: <strong>{paidInvoices.length}</strong>
            </p>

            <div className="progress-track">
              <div
                className="progress-fill paid-fill"
                style={{ width: `${paidPercentage}%` }}
              />
            </div>

            <p>
              Pending invoices: <strong>{pendingInvoices.length}</strong>
            </p>

            <div className="progress-track">
              <div
                className="progress-fill pending-fill"
                style={{ width: `${pendingPercentage}%` }}
              />
            </div>
          </div>
        </section>
      </>
    );
  }

  // ------------------------------------------
  // GEMINI AI ASSISTANT
  // ------------------------------------------

  function AIAssistantPage() {
    return (
      <>
        {PageHeader({
          description:
            "Your intelligent AI-powered business assistant.",
        })}

        <section className="panel ai-chat-panel">
          <div className="ai-chat-header">
            <div className="ai-chat-brand">
              <div className="ai-chat-logo">✦</div>
              <div>
                <h3>PayFlow AI</h3>
                <p>Gemini-powered business assistant</p>
              </div>
            </div>

            <button
              className="secondary-button"
              onClick={clearAIChat}
              disabled={aiLoading}
            >
              ↻ New chat
            </button>
          </div>

          <div className="ai-messages">
            {aiMessages.map((item, index) => {
              const isUser = item.role === "user";

              return (
                <div
                  className={`ai-message-row ${
                    isUser ? "user-message-row" : ""
                  }`}
                  key={index}
                >
                  {!isUser && (
                    <div className="ai-message-icon">✦</div>
                  )}

                  <div
                    className={`ai-message ${
                      isUser ? "user-message" : "model-message"
                    }`}
                  >
                    {item.content}
                  </div>
                </div>
              );
            })}

            {aiLoading && (
              <div className="ai-thinking">
                ✦ PayFlow AI is thinking...
              </div>
            )}
          </div>

          {aiError && (
            <div className="auth-error ai-error">{aiError}</div>
          )}

          {aiMessages.length <= 1 && (
            <div className="suggested-questions">
              <p>TRY ASKING</p>

              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  disabled={aiLoading}
                  onClick={() => sendAIMessage(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          <form
            className="ai-input-form"
            onSubmit={(event) => {
              event.preventDefault();
              sendAIMessage();
            }}
          >
            <input
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
              placeholder="Ask PayFlow AI anything..."
              disabled={aiLoading}
              maxLength={4000}
            />

            <button
              type="submit"
              disabled={!aiInput.trim() || aiLoading}
            >
              {aiLoading ? "..." : "Send ➤"}
            </button>
          </form>

          <p className="ai-disclaimer">
            AI responses may contain errors. Verify important financial information.
          </p>
        </section>
      </>
    );
  }

  // ------------------------------------------
  // SETTINGS PAGE
  // ------------------------------------------

  function SettingsPage() {
    return (
      <>
        {PageHeader({
          description:
            "Manage your PayFlow AI workspace preferences.",
        })}

        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h3>Account settings</h3>
              <p>Update your workspace information.</p>
            </div>
          </div>

          {settingsMessage && (
            <p className="settings-success">{settingsMessage}</p>
          )}

          <form onSubmit={saveSettings}>
            <label>
              {isDeveloper ? "Business name" : "Display name"}

              <input
                className="search-input settings-input"
                value={settings.businessName}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    businessName: event.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Email address

              <input
                className="search-input settings-input"
                type="email"
                value={settings.email}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    email: event.target.value,
                  })
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Default currency

              <select
                className="search-input settings-input"
                value={settings.currency}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    currency: event.target.value,
                  })
                }
              >
                <option value="USD">USD - US Dollar</option>
              </select>
            </label>

            <label className="notification-preference">
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    notifications: event.target.checked,
                  })
                }
              />
              Enable notifications preference
            </label>

            <button className="primary-button" type="submit">
              Save settings
            </button>
          </form>
        </section>

        <section className="panel payment-settings-panel">
          <h3>Account type</h3>
          <p>
            Signed in as{" "}
            <strong>
              {isDeveloper ? "Developer" : "Client"}
            </strong>
          </p>

          <p className="payment-settings-note">
            Your account permissions are managed securely by PayFlow AI.
          </p>

          {isClient && (
            <>
              <h3>Payment integration</h3>
              <p>PayPal Sandbox</p>
              <span className="status paid">
                Available for testing
              </span>
              <p className="payment-settings-note">
                No real payments are processed in Sandbox mode.
              </p>
            </>
          )}
        </section>
      </>
    );
  }

  // ------------------------------------------
  // PAGE ROUTER
  // ------------------------------------------

  function renderPage() {
    if (isClient) {
      switch (activePage) {
        case "Client Portal":
          return ClientPortalPage();

        case "My Invoices":
          return MyInvoicesPage();

        case "Settings":
          return SettingsPage();

        default:
          return ClientPortalPage();
      }
    }

    switch (activePage) {
      case "Overview":
        return OverviewPage();

      case "Invoices":
        return InvoicesPage();

      case "Payments":
        return PaymentsPage();

      case "Customers":
        return CustomersPage();

      case "Analytics":
        return AnalyticsPage();

      case "AI Assistant":
        return AIAssistantPage();

      case "Settings":
        return SettingsPage();

      default:
        return OverviewPage();
    }
  }

  // ------------------------------------------
  // NOTIFICATIONS
  // ------------------------------------------

  const notificationItems = [
    ...pendingInvoices.slice(0, 4).map((invoice) => ({
      id: `pending-${invoice.id}`,
      title: "Payment pending",
      description: `${invoice.client} · ${money(invoice.amount)}`,
      type: "pending",
    })),

    ...paidInvoices.slice(0, 3).map((invoice) => ({
      id: `paid-${invoice.id}`,
      title: "Payment received",
      description: `${invoice.client} · ${money(invoice.amount)}`,
      type: "paid",
    })),
  ].slice(0, 6);

  const userEmail = session?.user?.email || "";

  const userInitial = (
    userEmail.charAt(0) || "U"
  ).toUpperCase();

  const accountLabel = isClient ? "Client Account" : "Developer Account";

  const accountName =
    settings.businessName ||
    (isClient ? "My Account" : "Your Business");

  function goToSettings() {
    setActivePage("Settings");
    setOpenMenu("");
    setShowNotifications(false);
  }

  function navigateTo(page) {
    setActivePage(page);
    setSearch("");
    setApiError("");
    setOpenMenu("");
    setShowNotifications(false);
  }

  const visibleNavItems = isClient
    ? clientNavItems
    : developerNavItems;

  // ------------------------------------------
  // AUTH LOADING SCREEN
  // ------------------------------------------

  if (!authReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-loading-card">
          <div className="brand-logo auth-logo">P</div>
          <h2>
            PayFlow<span> AI</span>
          </h2>
          <p>Checking your secure session...</p>
          <div className="auth-spinner" />
        </div>
      </div>
    );
  }

  // ------------------------------------------
  // LOGIN / SIGNUP SCREEN
  // ------------------------------------------

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-logo auth-logo">P</div>

            <div>
              <h2>
                PayFlow<span> AI</span>
              </h2>
              <p>SMART PAYMENT PLATFORM</p>
            </div>
          </div>

          <div className="auth-heading">
            <h1>
              {authMode === "login"
                ? "Welcome back"
                : "Create your account"}
            </h1>

            <p>
              {authMode === "login"
                ? "Login to access your payment workspace."
                : "Choose your account type and get started."}
            </p>
          </div>

          {authError && (
            <div className="auth-error">{authError}</div>
          )}

          {authMessage && (
            <div className="auth-success">{authMessage}</div>
          )}

          <form
            className="auth-form"
            onSubmit={handleAuthSubmit}
          >
            {authMode === "signup" && (
              <label>
                Select account type

                <select
                  className="search-input settings-input"
                  value={selectedRole}
                  onChange={(event) =>
                    setSelectedRole(event.target.value)
                  }
                  required
                >
                  <option value="developer">
                    Developer - Create and manage invoices
                  </option>

                  <option value="client">
                    Client - View and pay invoices
                  </option>
                </select>
              </label>
            )}

            <label>
              Email address

              <input
                type="email"
                value={authEmail}
                onChange={(event) =>
                  setAuthEmail(event.target.value)
                }
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password

              <input
                type="password"
                value={authPassword}
                onChange={(event) =>
                  setAuthPassword(event.target.value)
                }
                placeholder="At least 6 characters"
                autoComplete={
                  authMode === "login"
                    ? "current-password"
                    : "new-password"
                }
                minLength={6}
                required
              />
            </label>

            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={authLoading}
            >
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                  ? "Login"
                  : "Create account"}
            </button>
          </form>

          <div className="auth-switch">
            {authMode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => {
                    setAuthMode("signup");
                    setSelectedRole("developer");
                    setAuthError("");
                    setAuthMessage("");
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setAuthMessage("");
                  }}
                >
                  Login
                </button>
              </>
            )}
          </div>

          <p className="auth-footer">
            Secure authentication powered by Supabase
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------
  // WAIT FOR PROFILE / ROLE
  // ------------------------------------------

  if (!profile) {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-loading-card">
          <div className="brand-logo auth-logo">P</div>
          <h2>
            PayFlow<span> AI</span>
          </h2>
          <p>Loading your account permissions...</p>
          <div className="auth-spinner" />

          {apiError && (
            <>
              <div className="auth-error">{apiError}</div>
              <button
                className="primary-button"
                onClick={handleLogout}
              >
                Logout and try again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------
  // MAIN APPLICATION
  // ------------------------------------------

  return (
    <div
      className="app-shell"
      onClick={() => {
        if (openMenu || showNotifications) {
          setOpenMenu("");
          setShowNotifications(false);
        }
      }}
    >
      {/* SIDEBAR */}

      <aside
        className="sidebar"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="brand">
          <div className="brand-logo">P</div>

          <div>
            <h2>
              PayFlow<span> AI</span>
            </h2>
            <p>SMART PAYMENT PLATFORM</p>
          </div>
        </div>

        <div className="nav-caption">WORKSPACE</div>

        <nav className="navigation">
          {visibleNavItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${
                activePage === item.label ? "active" : ""
              }`}
              onClick={() => navigateTo(item.label)}
            >
              <span className="nav-icon">{item.icon}</span>

              {item.label}

              {(item.label === "Invoices" ||
                item.label === "My Invoices") && (
                <span className="nav-count">
                  {invoices.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {isDeveloper && (
            <div className="ai-card">
              <div className="ai-spark">✦</div>
              <h3>Meet your AI assistant</h3>
              <p>Get smarter insights for your business.</p>

              <button
                onClick={() => {
                  navigateTo("AI Assistant");
                }}
              >
                Explore AI <span>→</span>
              </button>
            </div>
          )}

          <button
            className={`nav-item settings-item ${
              activePage === "Settings" ? "active" : ""
            }`}
            onClick={() => navigateTo("Settings")}
          >
            <span className="nav-icon">⚙</span>
            Settings
          </button>

          <div className="profile profile-click-area">
            <button
              className="profile-main-button"
              onClick={() => {
                setOpenMenu(
                  openMenu === "sidebar-profile"
                    ? ""
                    : "sidebar-profile"
                );
                setShowNotifications(false);
              }}
              aria-label="Open account menu"
            >
              <span className="avatar">{userInitial}</span>

              <span className="profile-info">
                <strong>{accountName}</strong>
                <span>{userEmail}</span>
              </span>
            </button>

            <button
              className="profile-menu-button"
              aria-label="Profile options"
              onClick={() => {
                setOpenMenu(
                  openMenu === "sidebar-profile"
                    ? ""
                    : "sidebar-profile"
                );
                setShowNotifications(false);
              }}
            >
              •••
            </button>

            {openMenu === "sidebar-profile" && (
              <div className="profile-dropdown sidebar-profile-dropdown">
                <div className="dropdown-user">
                  <strong>{accountName}</strong>
                  <span>{userEmail}</span>
                  <span>{accountLabel}</span>
                </div>

                <button onClick={goToSettings}>
                  ⚙ Account settings
                </button>

                <button
                  className="logout-option"
                  onClick={handleLogout}
                >
                  ↪ Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="main-content">
        <header
          className="topbar"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>

          <div className="top-actions">
            <div className="menu-anchor">
              <button
                className="sandbox-label sandbox-button"
                onClick={() => {
                  setOpenMenu(
                    openMenu === "sandbox" ? "" : "sandbox"
                  );
                  setShowNotifications(false);
                }}
              >
                <span /> Sandbox mode{" "}
                <span className="sandbox-chevron">⌄</span>
              </button>

              {openMenu === "sandbox" && (
                <div className="top-dropdown sandbox-dropdown">
                  <strong>PayPal Sandbox</strong>
                  <p>
                    Test environment is active. Payments here are
                    simulated and no real money is transferred.
                  </p>
                  <span className="status paid">
                    Testing mode active
                  </span>
                </div>
              )}
            </div>

            <div className="menu-anchor">
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setOpenMenu("");
                }}
              >
                ♧

                {notificationItems.length > 0 && (
                  <span className="notification-dot" />
                )}
              </button>

              {showNotifications && (
                <div className="top-dropdown notifications-dropdown">
                  <div className="dropdown-heading">
                    <strong>Notifications</strong>
                    <span>{notificationItems.length}</span>
                  </div>

                  {notificationItems.length ? (
                    notificationItems.map((item) => (
                      <div
                        className="notification-item"
                        key={item.id}
                      >
                        <span
                          className={`notification-indicator ${item.type}`}
                        />

                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.description}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-notifications">
                      You're all caught up.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="menu-anchor">
              <button
                className="top-avatar avatar-button"
                aria-label="Open profile menu"
                onClick={() => {
                  setOpenMenu(
                    openMenu === "top-profile"
                      ? ""
                      : "top-profile"
                  );
                  setShowNotifications(false);
                }}
              >
                {userInitial}
              </button>

              {openMenu === "top-profile" && (
                <div className="top-dropdown profile-dropdown top-profile-dropdown">
                  <div className="dropdown-user">
                    <strong>{accountName}</strong>
                    <span>{userEmail}</span>
                    <span>{accountLabel}</span>
                  </div>

                  <button onClick={goToSettings}>
                    ⚙ Account settings
                  </button>

                  <button
                    className="logout-option"
                    onClick={handleLogout}
                  >
                    ↪ Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="page-content">
          {apiError && (
            <p className="demo-note error-note">{apiError}</p>
          )}

          {paymentMessage && (
            <p className="demo-note success-note">
              {paymentMessage}
            </p>
          )}

          {loading && (
            <p className="demo-note">
              Loading invoices from backend...
            </p>
          )}

          {renderPage()}

          <p className="demo-note">
            Backend connected · PayPal Sandbox integration ·
            No real payments processed.
          </p>
        </section>
      </main>

      {/* CREATE INVOICE MODAL - DEVELOPER ONLY */}

      {showModal && isDeveloper && (
        <div
          className="modal-backdrop"
          onClick={() => !saving && setShowModal(false)}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2>Create an invoice</h2>
                <p>Add a customer and invoice amount.</p>
              </div>

              <button
                disabled={saving}
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={addInvoice}>
              <label>
                Client name

                <input
                  required
                  value={form.client}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      client: event.target.value,
                    })
                  }
                  placeholder="e.g. Acme Technologies"
                />
              </label>

              <label>
                Client email

                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                  placeholder="client@example.com"
                />
              </label>

              <label>
                Amount (USD)

                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      amount: event.target.value,
                    })
                  }
                  placeholder="500"
                />
              </label>

              <button
                className="primary-button modal-submit"
                type="submit"
                disabled={saving}
              >
                {saving ? "Creating..." : "Create invoice"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
