const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const rupiah = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);

let session = null, items = [], channel = null;

function monthRange(m) {
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  return [`${m}-01`, next];
}

async function load() {
  const [from, to] = monthRange($("month").value);
  const { data, error } = await db.from("transactions").select("*")
    .gte("date", from).lt("date", to)
    .order("date", { ascending: false }).order("created_at", { ascending: false });
  if (error) { $("msg").textContent = "Gagal memuat: " + error.message; return; }
  items = data;
  render();
}

function render() {
  let inc = 0, exp = 0;
  const ul = $("list");
  ul.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "Belum ada transaksi bulan ini.";
    li.className = "muted";
    ul.append(li);
  }
  for (const t of items) {
    const amt = Number(t.amount);
    if (t.type === "income") inc += amt; else exp += amt;

    const li = document.createElement("li");
    const left = document.createElement("div");
    const cat = document.createElement("strong");
    cat.textContent = t.category;
    const meta = document.createElement("small");
    meta.textContent = t.date + (t.note ? " · " + t.note : "");
    left.append(cat, document.createElement("br"), meta);

    const right = document.createElement("div");
    right.className = "row";
    const a = document.createElement("span");
    a.className = t.type;
    a.textContent = (t.type === "income" ? "+" : "-") + rupiah(amt);
    const del = document.createElement("button");
    del.textContent = "✕";
    del.className = "ghost";
    del.title = "Hapus";
    del.onclick = () => remove(t.id);
    right.append(a, del);

    li.append(left, right);
    ul.append(li);
  }
  $("sumIn").textContent = rupiah(inc);
  $("sumOut").textContent = rupiah(exp);
  $("sumBal").textContent = rupiah(inc - exp);
  $("sumBal").className = inc - exp >= 0 ? "income" : "expense";
}

async function add() {
  const amount = Number($("amount").value);
  const category = $("category").value.trim();
  if (!(amount > 0) || !category) { $("msg").textContent = "Isi jumlah (> 0) dan kategori."; return; }
  const { error } = await db.from("transactions").insert({
    type: $("type").value, amount, category,
    note: $("note").value.trim() || null,
    date: $("date").value || today()
  });
  if (error) { $("msg").textContent = "Gagal menyimpan: " + error.message; return; }
  $("msg").textContent = "";
  $("amount").value = ""; $("note").value = "";
  load();
}

async function remove(id) {
  if (!confirm("Hapus transaksi ini?")) return;
  const { error } = await db.from("transactions").delete().eq("id", id);
  if (error) $("msg").textContent = "Gagal menghapus: " + error.message;
  else load();
}

function subscribe() {
  if (channel) return;
  channel = db.channel("tx-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
    .subscribe();
}

function setSession(s) {
  const wasIn = !!session;
  session = s;
  $("auth").hidden = !!s;
  $("app").hidden = !s;
  if (s) {
    $("who").textContent = s.user.email;
    if (!wasIn) {
      if (!$("month").value) $("month").value = today().slice(0, 7);
      if (!$("date").value) $("date").value = today();
      load();
      subscribe();
    }
  } else {
    if (channel) { db.removeChannel(channel); channel = null; }
    items = [];
  }
}

async function auth(kind) {
  const email = $("email").value.trim(), password = $("password").value;
  $("authMsg").textContent = "Memproses...";
  const fn = kind === "login" ? db.auth.signInWithPassword : db.auth.signUp;
  const { data, error } = await fn.call(db.auth, { email, password });
  if (error) { $("authMsg").textContent = error.message; return; }
  $("authMsg").textContent = kind === "signup" && !data.session
    ? "Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk." : "";
}

$("btnLogin").onclick = () => auth("login");
$("btnSignup").onclick = () => auth("signup");
$("btnLogout").onclick = () => db.auth.signOut();
$("btnAdd").onclick = add;
$("month").onchange = load;

(async () => {
  const { data } = await db.auth.getSession();
  setSession(data.session);
  db.auth.onAuthStateChange((_e, s) => setSession(s));
})();
