// CORE APP CONTROLLER
// Handles application logic, DOM interactions, routing, printing, and file exports.

const App = (function () {
  // --- APPLICATION STATE ---
  const state = {
    currentUser: null,
    currentView: 'login',
    currentRequestId: null,
    activeRequestItems: [],
    filters: {
      requestNo: '',
      customerName: '',
      productName: '',
      batchNumber: '',
      rmNo: '',
      status: '',
      startDate: '',
      endDate: ''
    },
    historyFilters: {
      productName: '',
      batchNumber: '',
      rmNo: '',
      requestNo: '',
      testResult: '',
      startDate: '',
      endDate: ''
    }
  };

  // --- VIEW CONTAINERS MAP ---
  const VIEWS = {
    login: 'login-screen',
    dashboard: 'view-dashboard',
    requests: 'view-requests',
    'request-create': 'view-request-form',
    'request-edit': 'view-request-form',
    'request-detail': 'view-request-detail',
    history: 'view-history',
    users: 'view-users'
  };

  // --- INITIALIZATION ---
  async function init() {
    console.log('Initializing LRMS Application...');
    
    // 1. Set connection badge status
    updateConnectionBadge();

    // 2. Add event listener to form edits in item lists
    setupGlobalListeners();

    // 3. Attempt auto-login with existing session
    try {
      const user = await window.DB.getCurrentUser();
      if (user) {
        state.currentUser = user;
        updateUIForUser();
        navigate('dashboard');
      } else {
        navigate('login');
      }
    } catch (e) {
      console.error('Session retrieval failed, defaulting to Login screen:', e);
      navigate('login');
    }
  }

  // Set visual status indicator for database connection type
  function updateConnectionBadge() {
    const badge = document.getElementById('conn-status-badge');
    if (!badge) return;

    const config = window.AppConfig.load();
    if (window.AppConfig.isSupabaseConfigured(config)) {
      badge.innerHTML = `
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#38bdf8; box-shadow:0 0 8px #0284c7;"></span>
        <span style="color:#0284c7;">Supabase Cloud Connected</span>
      `;
    } else {
      badge.innerHTML = `
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#ef4444; box-shadow:0 0 8px #dc2626;"></span>
        <span style="color:#dc2626; font-weight:600;">Supabase Config Required</span>
      `;
    }
  }

  function setupGlobalListeners() {
    // Esc key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeConfigModal();
        closeBatchTraceModal();
        closeCreateUserModal();
        closeChangePasswordModal();
      }
    });

    // Handle side nav toggle on mobile viewports
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      const toggleBtn = document.querySelector('.mobile-menu-toggle');
      if (sidebar && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target))) {
          sidebar.classList.remove('open');
        }
      }
    });
  }

  // --- ROUTING / VIEW NAVIGATOR ---
  function navigate(viewName, params = {}) {
    console.log(`Navigating to: ${viewName}`, params);

    // Security check: restrict admin/lab views
    if (state.currentUser) {
      if (viewName === 'users' && state.currentUser.role !== 'admin') {
        showToast('คุณไม่มีสิทธิ์เข้าใช้งานเมนูนี้', 'error');
        navigate('dashboard');
        return;
      }
      if (viewName === 'history' && !['admin', 'lab'].includes(state.currentUser.role)) {
        showToast('คุณไม่มีสิทธิ์เข้าใช้งานเมนูนี้', 'error');
        navigate('dashboard');
        return;
      }
    }

    // Hide all view screens
    Object.values(VIEWS).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Update active nav highlights in sidebar
    const navItems = {
      dashboard: 'nav-dashboard',
      requests: 'nav-requests',
      'request-create': 'nav-requests',
      'request-edit': 'nav-requests',
      'request-detail': 'nav-requests',
      history: 'nav-history',
      users: 'nav-users'
    };

    document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('active'));
    const activeNavId = navItems[viewName];
    if (activeNavId) {
      const navEl = document.getElementById(activeNavId);
      if (navEl) navEl.classList.add('active');
    }

    // Handle shell layout toggle based on login
    const shell = document.getElementById('app-shell');
    const loginScreen = document.getElementById('login-screen');

    if (viewName === 'login') {
      if (shell) shell.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
      state.currentUser = null;
      state.currentRequestId = null;
    } else {
      if (loginScreen) loginScreen.style.display = 'none';
      if (shell) shell.style.display = 'flex';
    }

    state.currentView = viewName;
    const viewEl = document.getElementById(VIEWS[viewName]);
    if (viewEl) viewEl.style.display = 'block';

    // Toggle mobile sidebar state closed on navigate
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');

    // Run loaders depending on page view target
    switch (viewName) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'requests':
        loadRequestsList();
        break;
      case 'request-create':
        prepareRequestForm(null);
        break;
      case 'request-edit':
        prepareRequestForm(params.id);
        break;
      case 'request-detail':
        loadRequestDetail(params.id);
        break;
      case 'history':
        loadMaterialHistory();
        break;
      case 'users':
        loadUsersManager();
        break;
    }

    // Scroll view back to top
    window.scrollTo(0, 0);
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  }

  // --- LOGIN & LOGOUT CONTROL ---
  async function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error-msg');
    
    if (!usernameInput || !passwordInput) return;
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    errorMsg.style.display = 'none';

    try {
      showLoadingButton(e.submitter, true, 'กำลังตรวจสอบ...');
      const user = await window.DB.login(username, password);
      state.currentUser = user;
      
      // Seed UI elements
      updateUIForUser();
      showToast(`ยินดีต้อนรับคุณ ${user.display_name}`, 'success');
      
      passwordInput.value = '';
      usernameInput.value = '';

      navigate('dashboard');
    } catch (err) {
      console.error(err);
      errorMsg.innerText = err.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
      errorMsg.style.display = 'block';
    } finally {
      showLoadingButton(e.submitter, false, 'เข้าสู่ระบบ');
    }
  }

  async function logout() {
    try {
      await window.DB.logout();
      showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    } catch (e) {
      console.error('Logout failed:', e);
    }
    navigate('login');
  }

  function updateUIForUser() {
    if (!state.currentUser) return;
    
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const exportBtn = document.getElementById('btn-admin-export');
    
    if (nameEl) nameEl.innerText = state.currentUser.display_name;
    if (roleEl) {
      if (state.currentUser.role === 'admin') {
        roleEl.innerText = 'LAB Admin';
        roleEl.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        roleEl.style.color = '#f87171';
      } else if (state.currentUser.role === 'lab') {
        roleEl.innerText = 'LAB Staff';
        roleEl.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
        roleEl.style.color = '#c084fc';
      } else {
        roleEl.innerText = 'Requester';
        roleEl.style.backgroundColor = 'rgba(2, 132, 199, 0.2)';
        roleEl.style.color = '#38bdf8';
      }
    }

    // Role features visibility
    const isUserAdmin = state.currentUser.role === 'admin';
    const isUserLab = state.currentUser.role === 'lab';
    
    // Sidebar nav nodes
    const navHistory = document.getElementById('nav-history');
    const navUsers = document.getElementById('nav-users');
    if (navHistory) navHistory.style.display = (isUserAdmin || isUserLab) ? 'block' : 'none';
    if (navUsers) navUsers.style.display = isUserAdmin ? 'block' : 'none';

    // List export buttons
    if (exportBtn) exportBtn.style.display = isUserAdmin ? 'inline-flex' : 'none';
  }

  // --- 1. DASHBOARD CARD LOADER ---
  async function loadDashboard() {
    try {
      // Get requests matching role
      const requests = await window.DB.getRequests({});
      
      const total = requests.length;
      const pending = requests.filter(r => r.status === 'Pending').length;
      const completed = requests.filter(r => r.status === 'Completed').length;

      document.getElementById('stat-total').innerText = total;
      document.getElementById('stat-pending').innerText = pending;
      document.getElementById('stat-completed').innerText = completed;

      // Populate recent request table (Max 5 items)
      const recentBody = document.getElementById('dashboard-recent-tbody');
      recentBody.innerHTML = '';

      const recents = requests.slice(0, 5);
      if (recents.length === 0) {
        recentBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">ไม่มีข้อมูลรายการล่าสุด</td></tr>`;
        return;
      }

      recents.forEach(r => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(r.request_date);
        const formattedTime = r.request_time.slice(0, 5);
        const statusBadge = r.status === 'Completed' ? 'completed' : 'pending';
        const statusText = r.status === 'Completed' ? 'Completed' : 'Pending';

        tr.innerHTML = `
          <td><strong>${r.request_no}/${r.request_year}</strong></td>
          <td>${formattedDate} ${formattedTime} น.</td>
          <td>${escapeHtml(r.customer_name)}</td>
          <td>${escapeHtml(r.requester_name)}</td>
          <td><span class="badge ${statusBadge}">${statusText}</span></td>
          <td class="actions-column">
            <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${r.id}'})" title="ดูรายละเอียด">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        `;
        recentBody.appendChild(tr);
      });
    } catch (e) {
      console.error('Error loading dashboard statistics:', e);
      showToast('ไม่สามารถโหลดข้อมูลสถิติแดชบอร์ดได้', 'error');
    }
  }

  // --- 2. REQUESTS LIST LOADER & FILTERS ---
  async function loadRequestsList() {
    const listBody = document.getElementById('requests-list-tbody');
    listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดรายการใบแจ้งตรวจสอบ...</td></tr>`;

    try {
      const requests = await window.DB.getRequests(state.filters);
      listBody.innerHTML = '';

      if (requests.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่พบรายการใบแจ้งตรวจสอบที่ตรงกับเงื่อนไขการค้นหา</td></tr>`;
        return;
      }

      requests.forEach(r => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(r.request_date);
        const formattedTime = r.request_time.slice(0, 5);
        const statusBadge = r.status === 'Completed' ? 'completed' : 'pending';
        const statusText = r.status === 'Completed' ? 'Completed' : 'Pending';

        tr.innerHTML = `
          <td><strong>${r.request_no}/${r.request_year}</strong></td>
          <td>${formattedDate} ${formattedTime} น.</td>
          <td>${escapeHtml(r.customer_name)}</td>
          <td>${escapeHtml(r.requester_name)}</td>
          <td><span class="badge ${statusBadge}">${statusText}</span></td>
          <td class="actions-column">
            <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${r.id}'})" title="ดูรายละเอียด">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        `;
        listBody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-danger); padding:30px;">เกิดข้อผิดพลาดในการดึงข้อมูล: ${e.message}</td></tr>`;
    }
  }

  function handleFilterSubmit(e) {
    e.preventDefault();
    state.filters = {
      requestNo: document.getElementById('filter-no').value.trim(),
      customerName: document.getElementById('filter-customer').value.trim(),
      productName: document.getElementById('filter-product').value.trim(),
      batchNumber: document.getElementById('filter-batch').value.trim(),
      rmNo: document.getElementById('filter-rm').value.trim(),
      status: document.getElementById('filter-status').value,
      startDate: document.getElementById('filter-start-date').value,
      endDate: document.getElementById('filter-end-date').value
    };
    loadRequestsList();
  }

  function clearFilters() {
    document.getElementById('filter-no').value = '';
    document.getElementById('filter-customer').value = '';
    document.getElementById('filter-product').value = '';
    document.getElementById('filter-batch').value = '';
    document.getElementById('filter-rm').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';

    state.filters = {
      requestNo: '', customerName: '', productName: '', batchNumber: '', rmNo: '', status: '', startDate: '', endDate: ''
    };
    loadRequestsList();
  }

  // --- 3. CREATE / EDIT REQUEST CONTROLLER ---
  async function prepareRequestForm(requestId = null) {
    const titleEl = document.getElementById('request-form-title');
    const form = document.getElementById('request-main-form');
    const formIdInput = document.getElementById('form-request-id');
    const customerInput = document.getElementById('form-customer');
    const requesterInput = document.getElementById('form-requester-display');
    const carPlateInput = document.getElementById('form-car-plate');
    const sealInput = document.getElementById('form-seal-no');
    const containerInput = document.getElementById('form-container-no');
    const notesInput = document.getElementById('form-notes');
    const commentsInput = document.getElementById('form-lab-comments');
    const tbody = document.getElementById('form-items-tbody');

    const adminNoBlock = document.getElementById('form-admin-no-edit');
    const formReqNo = document.getElementById('form-request-no');
    const formReqYear = document.getElementById('form-request-year');

    // Clean form elements
    form.reset();
    tbody.innerHTML = '';
    state.activeRequestItems = [];

    const isEditMode = requestId !== null;
    state.currentRequestId = requestId;
    formIdInput.value = requestId || '';

    // Handle user role fields visibility (RM No & Lab comments are admin-only)
    const isAdmin = state.currentUser.role === 'admin';
    const isLab = state.currentUser.role === 'lab';
    const isRequester = state.currentUser.role === 'requester';
    const isAdminOrLab = isAdmin || isLab;

    document.querySelectorAll('.admin-field').forEach(el => {
      el.style.display = isAdmin ? 'block' : 'none';
    });

    document.querySelectorAll('.admin-lab-field').forEach(el => {
      const isTableCell = el.tagName === 'TH' || el.tagName === 'TD';
      el.style.display = isAdminOrLab ? (isTableCell ? 'table-cell' : 'block') : 'none';
    });

    const statusGroup = document.getElementById('form-status-group');
    const statusSelect = document.getElementById('form-status');
    if (statusGroup && statusSelect) {
      statusGroup.style.display = isEditMode && isAdminOrLab ? 'block' : 'none';
    }

    if (isEditMode) {
      titleEl.innerText = 'แก้ไขใบแจ้งตรวจสอบ';
      
      try {
        const details = await window.DB.getRequestDetail(requestId);
        
        customerInput.value = details.customer_name;
        requesterInput.value = details.requester_name;
        carPlateInput.value = details.car_plate || '';
        sealInput.value = details.seal_no || '';
        containerInput.value = details.container_no || '';
        notesInput.value = details.notes || '';
        commentsInput.value = details.lab_comments || '';
        if (statusSelect) statusSelect.value = details.status || 'Pending';

        // Show fields to manually edit request no and request year
        if (isAdminOrLab && adminNoBlock && formReqNo && formReqYear) {
          adminNoBlock.style.display = 'grid';
          formReqNo.value = details.request_no;
          formReqYear.value = details.request_year;

          const dateInput = document.getElementById('form-request-date');
          const timeInput = document.getElementById('form-request-time');
          if (dateInput) dateInput.value = details.request_date || '';
          if (timeInput) timeInput.value = details.request_time ? details.request_time.slice(0, 5) : '';

          formReqNo.required = true;
          formReqYear.required = true;
        } else if (adminNoBlock) {
          adminNoBlock.style.display = 'none';
        }

        // Add item rows
        details.items.forEach(item => addFormItemRow(item));

      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถดึงข้อมูลรายละเอียดมาทำการแก้ไขได้: ' + e.message, 'error');
        navigate('requests');
      }
    } else {
      titleEl.innerText = 'สร้างใบแจ้งตรวจสอบห้องปฏิบัติการ';
      requesterInput.value = state.currentUser.display_name;

      if (adminNoBlock) adminNoBlock.style.display = 'none';
      if (formReqNo) { formReqNo.required = false; formReqNo.value = ''; }
      if (formReqYear) { formReqYear.required = false; formReqYear.value = ''; }

      // Insert first row automatically for convenience
      addFormItemRow();
    }

    // Setup inputs readOnly/disabled state based on Role & Mode
    const nonLabInputs = [
      customerInput, carPlateInput, sealInput, containerInput, notesInput,
      formReqNo, formReqYear, document.getElementById('form-request-date'), document.getElementById('form-request-time')
    ];

    nonLabInputs.forEach(input => {
      if (input) {
        if (isEditMode) {
          input.disabled = isLab || isRequester;
          input.readOnly = isLab || isRequester;
        } else {
          input.disabled = false;
          input.readOnly = false;
        }
      }
    });

    if (commentsInput) {
      commentsInput.disabled = !isEditMode || isRequester;
    }
    if (statusSelect) {
      statusSelect.disabled = !isEditMode || isRequester;
    }

    const addItemBtn = document.querySelector('button[onclick="App.addFormItemRow()"]');
    if (addItemBtn) {
      addItemBtn.style.display = isEditMode && (isLab || isRequester) ? 'none' : 'inline-flex';
    }
  }

  function addFormItemRow(item = {}) {
    const tbody = document.getElementById('form-items-tbody');
    const rowId = 'item-row-' + Math.random().toString(36).slice(2, 9);
    const tr = document.createElement('tr');
    tr.id = rowId;

    const isAdmin = state.currentUser.role === 'admin';
    const isLab = state.currentUser.role === 'lab';
    const isRequester = state.currentUser.role === 'requester';
    const isAdminOrLab = isAdmin || isLab;

    // Populate values
    const id = item.id || '';
    const name = item.product_name || '';
    const batch = item.batch_number || '';
    const qty = item.quantity || '';
    const rm = item.rm_no || '';
    const result = item.test_result || 'In Progress';

    const isEditMode = state.currentRequestId !== null;
    const disableInputs = isEditMode && (isLab || isRequester);
    const showDelete = !(isEditMode && (isLab || isRequester));

    tr.innerHTML = `
      <td>
        <input type="hidden" class="item-form-id" value="${id}">
        <input type="text" class="item-form-name" required placeholder="เช่น Hydraulic Oil AW 68" value="${escapeHtml(name)}" ${disableInputs ? 'disabled readonly style="background-color:#f1f5f9; cursor:not-allowed;"' : ''}>
      </td>
      <td>
        <input type="text" class="item-form-batch" required placeholder="เช่น B-260510-1" value="${escapeHtml(batch)}" ${disableInputs ? 'disabled readonly style="background-color:#f1f5f9; cursor:not-allowed;"' : ''}>
      </td>
      <td>
        <input type="text" class="item-form-qty" required placeholder="เช่น 10 Drums หรือ 5000L" value="${escapeHtml(qty)}" ${disableInputs ? 'disabled readonly style="background-color:#f1f5f9; cursor:not-allowed;"' : ''}>
      </td>
      <td class="admin-lab-field" style="display:${isAdminOrLab ? 'table-cell' : 'none'};">
        <input type="text" class="item-form-rm" placeholder="เช่น RM-HYD-01" value="${escapeHtml(rm)}" ${isRequester ? 'disabled readonly' : ''}>
      </td>
      <td class="admin-lab-field" style="display:${isAdminOrLab ? 'table-cell' : 'none'};">
        <select class="item-form-result" style="padding: 8px 10px;" ${isRequester ? 'disabled' : ''}>
          <option value="In Progress" ${result === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Pass" ${result === 'Pass' ? 'selected' : ''}>Pass</option>
          <option value="Fail" ${result === 'Fail' ? 'selected' : ''}>Fail</option>
          <option value="Hold" ${result === 'Hold' ? 'selected' : ''}>Hold</option>
        </select>
      </td>
      <td style="text-align:center;">
        ${showDelete ? `
        <button type="button" class="btn btn-secondary btn-sm" style="color:var(--text-danger); border-color:#fee2e2; padding:6px; min-width:32px;" onclick="App.removeFormItemRow('${rowId}')" title="ลบรายการนี้">
          &times;
        </button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }

  function removeFormItemRow(rowId) {
    const tbody = document.getElementById('form-items-tbody');
    // Prevent deleting the only remaining row
    if (tbody.children.length <= 1) {
      showToast('ต้องมีสินค้าอย่างน้อย 1 รายการในใบแจ้งตรวจสอบ', 'warning');
      return;
    }
    const row = document.getElementById(rowId);
    if (row) row.remove();
  }

  async function handleRequestFormSubmit(e) {
    e.preventDefault();

    const customerName = document.getElementById('form-customer').value.trim();
    const carPlate = document.getElementById('form-car-plate').value.trim();
    const sealNo = document.getElementById('form-seal-no').value.trim();
    const containerNo = document.getElementById('form-container-no').value.trim();
    const notes = document.getElementById('form-notes').value.trim();
    const labComments = document.getElementById('form-lab-comments').value.trim();

    // Compile dynamic items from table rows
    const itemRows = document.querySelectorAll('#form-items-tbody tr');
    const itemsData = [];

    for (let row of itemRows) {
      const pName = row.querySelector('.item-form-name').value.trim();
      const pBatch = row.querySelector('.item-form-batch').value.trim();
      const pQty = row.querySelector('.item-form-qty').value.trim();
      
      const idVal = row.querySelector('.item-form-id').value;
      const rmInput = row.querySelector('.item-form-rm');
      const resultSelect = row.querySelector('.item-form-result');

      const pRm = rmInput ? rmInput.value.trim() : '';
      const pResult = resultSelect ? resultSelect.value : 'In Progress';

      if (!pName || !pBatch || !pQty) {
        showToast('กรุณากรอกข้อมูลสินค้าให้ครบถ้วนในทุกแถว', 'warning');
        return;
      }

      itemsData.push({
        id: idVal || undefined,
        product_name: pName,
        batch_number: pBatch,
        quantity: pQty,
        rm_no: pRm,
        test_result: pResult
      });
    }

    if (itemsData.length === 0) {
      showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning');
      return;
    }

    const requestDate = document.getElementById('form-request-date').value;
    const requestTime = document.getElementById('form-request-time').value;

    const statusSelect = document.getElementById('form-status');
    const requestData = {
      customer_name: customerName,
      car_plate: carPlate,
      seal_no: sealNo,
      container_no: containerNo,
      notes: notes,
      lab_comments: labComments,
      request_date: requestDate,
      request_time: requestTime
    };

    if (statusSelect && statusSelect.value) {
      requestData.status = statusSelect.value;
    }

    // If Admin or Lab is editing, include the manual request numbers if provided
    const isAdmin = state.currentUser.role === 'admin';
    const isLab = state.currentUser.role === 'lab';
    const isAdminOrLab = isAdmin || isLab;
    const formReqNo = document.getElementById('form-request-no');
    const formReqYear = document.getElementById('form-request-year');
    if (isAdminOrLab && formReqNo && formReqYear && formReqNo.value) {
      requestData.request_no = formReqNo.value;
      requestData.request_year = formReqYear.value;
    }

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึกข้อมูล...');
      
      if (state.currentRequestId) {
        // Update request
        const updated = await window.DB.updateRequest(state.currentRequestId, requestData, itemsData);
        showToast('แก้ไขข้อมูลใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
        navigate('request-detail', { id: updated.id });
      } else {
        // Create request
        const created = await window.DB.createRequest(requestData, itemsData);
        showToast('บันทึกใบแจ้งตรวจสอบส่งแล็บเรียบร้อยแล้ว', 'success');
        navigate('request-detail', { id: created.id });
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถบันทึกข้อมูลได้: ' + err.message, 'error');
    } finally {
      showLoadingButton(e.submitter, false, 'บันทึกข้อมูลใบแจ้ง');
    }
  }

  // --- 4. REQUEST DETAIL CONTROLLER & PRINT WRITER ---
  async function loadRequestDetail(id) {
    state.currentRequestId = id;
    
    // Clear detail display values
    document.getElementById('detail-no').innerText = 'Loading...';
    document.getElementById('detail-datetime').innerText = '';
    document.getElementById('detail-customer').innerText = '';
    document.getElementById('detail-requester').innerText = '';
    
    const itemsTbody = document.getElementById('detail-items-tbody');
    itemsTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">กำลังโหลดข้อมูลรายการสินค้า...</td></tr>`;

    try {
      const details = await window.DB.getRequestDetail(id);
      
      // Update details fields
      document.getElementById('detail-no').innerText = `${details.request_no}/${details.request_year}`;
      document.getElementById('detail-datetime').innerText = `${formatThaiDate(details.request_date)} เวลา ${details.request_time.slice(0, 5)} น.`;
      document.getElementById('detail-customer').innerText = details.customer_name;
      document.getElementById('detail-requester').innerText = details.requester_name;

      // Status Badge
      const statusBadge = document.getElementById('detail-status-badge');
      statusBadge.innerText = details.status === 'Completed' ? 'Completed' : 'Pending';
      statusBadge.className = `badge ${details.status === 'Completed' ? 'completed' : 'pending'}`;

      // Transport values
      document.getElementById('detail-car-plate').innerText = details.car_plate || 'ไม่ระบุ';
      document.getElementById('detail-seal-no').innerText = details.seal_no || 'ไม่ระบุ';
      document.getElementById('detail-container-no').innerText = details.container_no || 'ไม่ระบุ';

      // Notes and comments
      document.getElementById('detail-notes').innerText = details.notes || 'ไม่มีหมายเหตุ';
      document.getElementById('detail-lab-comments').innerText = details.lab_comments || 'ไม่มีความคิดเห็นจากห้องปฏิบัติการ';

      // Items table
      itemsTbody.innerHTML = '';
      details.items.forEach(item => {
        const tr = document.createElement('tr');
        
        const isRequester = state.currentUser.role === 'requester';
        const isPendingItem = item.test_result === 'In Progress';
        
        // Hide if requester and item is pending
        const showBlank = isRequester && isPendingItem;
        
        const displayRm = showBlank ? '' : (item.rm_no || '');
        let displayRes = showBlank ? '' : item.test_result;
        
        let resClass = 'result-progress';
        if (showBlank) {
          resClass = '';
        } else {
          if (item.test_result === 'Pass') resClass = 'result-pass';
          if (item.test_result === 'Fail') resClass = 'result-fail';
          if (item.test_result === 'Hold') resClass = 'result-hold';
        }

        tr.innerHTML = `
          <td><strong>${escapeHtml(item.product_name)}</strong></td>
          <td>
            ${['admin', 'lab'].includes(state.currentUser.role) 
              ? `<a href="#" style="font-weight:500;" onclick="App.traceBatch('${escapeHtml(item.batch_number)}'); return false;" title="คลิกเพื่อตรวจสอบประวัติของ Batch นี้">${escapeHtml(item.batch_number)}</a>`
              : `<span>${escapeHtml(item.batch_number)}</span>`
            }
          </td>
          <td>${escapeHtml(item.quantity)}</td>
          <td>${displayRm ? `<code>${escapeHtml(displayRm)}</code>` : ''}</td>
          <td>${displayRes ? `<span class="badge ${resClass}">${displayRes}</span>` : ''}</td>
        `;
        itemsTbody.appendChild(tr);
      });

      // Show/Hide action buttons according to rules
      const isAdmin = state.currentUser.role === 'admin';
      const isLab = state.currentUser.role === 'lab';
      const editBtn = document.getElementById('btn-detail-edit');
      const deleteBtn = document.getElementById('btn-detail-delete');

      if (editBtn) editBtn.style.display = (isAdmin || isLab) ? 'inline-flex' : 'none';
      if (deleteBtn) deleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';

      // PREPARE A4 PRINT LAYOUT TEMPLATE FOR NATIVE PRINT
      populateA4PrintTemplate(details);

    } catch (e) {
      console.error(e);
      showToast('ไม่สามารถดึงข้อมูลรายละเอียดใบแจ้งได้: ' + e.message, 'error');
      navigate('requests');
    }
  }

  function populateA4PrintTemplate(details) {
    document.getElementById('print-no').innerText = `${details.request_no}/${details.request_year}`;
    document.getElementById('print-date').innerText = formatThaiDate(details.request_date);
    document.getElementById('print-time').innerText = `${details.request_time.slice(0, 5)} น.`;
    document.getElementById('print-customer').innerText = details.customer_name;
    document.getElementById('print-requester').innerText = details.requester_name;
    document.getElementById('print-status').innerText = details.status;
    document.getElementById('print-status').style.color = details.status === 'Completed' ? '#16a34a' : '#d97706';

    document.getElementById('print-car-plate').innerText = details.car_plate || '-';
    document.getElementById('print-seal-no').innerText = details.seal_no || '-';
    document.getElementById('print-container-no').innerText = details.container_no || '-';

    document.getElementById('print-notes').innerText = details.notes || '';
    document.getElementById('print-lab-comments').innerText = details.lab_comments || '';

    const printTbody = document.getElementById('print-items-tbody');
    printTbody.innerHTML = '';
    
    const isRequester = state.currentUser.role === 'requester';
    
    details.items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const showBlank = isRequester && item.test_result === 'In Progress';
      const displayRm = showBlank ? '' : (item.rm_no || '-');
      const displayRes = showBlank ? '' : item.test_result;
      
      tr.innerHTML = `
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(item.product_name)}</td>
        <td>${escapeHtml(item.batch_number)}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${escapeHtml(displayRm)}</td>
        <td style="text-align:center; font-weight:bold; color:${displayRes === 'Pass' ? '#16a34a' : (displayRes === 'Fail' ? '#dc2626' : (displayRes === 'Hold' ? '#d97706' : '#64748b'))}">${displayRes}</td>
      `;
      printTbody.appendChild(tr);
    });
  }

  function editCurrentRequest() {
    if (state.currentRequestId) {
      navigate('request-edit', { id: state.currentRequestId });
    }
  }

  async function deleteCurrentRequest() {
    if (!state.currentRequestId) return;
    
    if (confirm('คุณแน่ใจว่าต้องการลบใบแจ้งตรวจสอบห้องปฏิบัติการใบนี้ใช่หรือไม่? การลบจะไม่สามารถกู้ข้อมูลกลับมาได้')) {
      try {
        await window.DB.deleteRequest(state.currentRequestId);
        showToast('ลบข้อมูลใบแจ้งตรวจสอบเรียบร้อยแล้ว', 'success');
        navigate('requests');
      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถลบข้อมูลได้: ' + e.message, 'error');
      }
    }
  }

  // --- 5. MATERIAL HISTORY AUDIT LOADER (ADMIN ONLY) ---
  async function loadMaterialHistory() {
    const listBody = document.getElementById('history-list-tbody');
    // Pre-populate input values with filters state
    document.getElementById('hist-product').value = state.historyFilters.productName;
    document.getElementById('hist-batch').value = state.historyFilters.batchNumber;
    document.getElementById('hist-rm').value = state.historyFilters.rmNo;
    document.getElementById('hist-request-no').value = state.historyFilters.requestNo;
    document.getElementById('hist-result').value = state.historyFilters.testResult;
    document.getElementById('hist-start-date').value = state.historyFilters.startDate;
    document.getElementById('hist-end-date').value = state.historyFilters.endDate;

    listBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดประวัติวัตถุดิบ...</td></tr>`;

    try {
      const history = await window.DB.getMaterialHistory(state.historyFilters);
      listBody.innerHTML = '';

      if (history.length === 0) {
        listBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่พบประวัติการส่งทดสอบของชิ้นงาน/วัตถุดิบนี้</td></tr>`;
        return;
      }

      history.forEach(h => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(h.request_date);
        const formattedTime = h.request_time.slice(0, 5);
        
        let resClass = 'result-progress';
        if (h.test_result === 'Pass') resClass = 'result-pass';
        if (h.test_result === 'Fail') resClass = 'result-fail';
        if (h.test_result === 'Hold') resClass = 'result-hold';

        const statusBadge = h.status === 'Completed' ? 'completed' : 'pending';

        tr.innerHTML = `
          <td><strong>${h.request_no}/${h.request_year}</strong></td>
          <td>${formattedDate} ${formattedTime} น.</td>
          <td>${escapeHtml(h.product_name)}</td>
          <td>
            <a href="#" style="font-weight:500;" onclick="App.traceBatch('${escapeHtml(h.batch_number)}'); return false;" title="คลิกดูประวัติทั้งหมดของ Batch นี้">
              ${escapeHtml(h.batch_number)}
            </a>
          </td>
          <td>${h.rm_no ? `<code>${escapeHtml(h.rm_no)}</code>` : '<em style="color:var(--text-muted);">ว่าง</em>'}</td>
          <td><span class="badge ${resClass}">${h.test_result}</span></td>
          <td>${escapeHtml(h.requester_name)}</td>
          <td><span class="badge ${statusBadge}">${h.status}</span></td>
          <td style="text-align:center;">
            <button class="btn-icon" onclick="App.navigate('request-detail', {id: '${h.request_id}'})" title="ดูรายละเอียดใบแจ้ง">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        `;
        listBody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-danger); padding:30px;">เกิดข้อผิดพลาดในการโหลดประวัติวัตถุดิบ: ${e.message}</td></tr>`;
    }
  }

  function handleHistoryFilter(e) {
    e.preventDefault();
    state.historyFilters = {
      productName: document.getElementById('hist-product').value.trim(),
      batchNumber: document.getElementById('hist-batch').value.trim(),
      rmNo: document.getElementById('hist-rm').value.trim(),
      requestNo: document.getElementById('hist-request-no').value.trim(),
      testResult: document.getElementById('hist-result').value,
      startDate: document.getElementById('hist-start-date').value,
      endDate: document.getElementById('hist-end-date').value
    };
    loadMaterialHistory();
  }

  function clearHistoryFilters() {
    state.historyFilters = {
      productName: '', batchNumber: '', rmNo: '', requestNo: '', testResult: '', startDate: '', endDate: ''
    };
    loadMaterialHistory();
  }

  // --- BATCH TRACE POPUP LOADER (ADMIN ONLY) ---
  async function traceBatch(batchNumber) {
    console.log('Tracing batch:', batchNumber);
    const modal = document.getElementById('modal-batch-trace');
    const title = document.getElementById('batch-trace-title');
    const tbody = document.getElementById('batch-trace-tbody');

    if (!modal || !title || !tbody) return;

    title.innerText = `ประวัติการตรวจสอบของ Batch: ${batchNumber}`;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">กำลังสืบค้นประวัติ...</td></tr>`;
    
    modal.classList.add('open');

    try {
      const traceLogs = await window.DB.getBatchHistory(batchNumber);
      tbody.innerHTML = '';

      if (traceLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">ไม่พบประวัติสำหรับ Batch: ${batchNumber}</td></tr>`;
        return;
      }

      traceLogs.forEach(h => {
        const tr = document.createElement('tr');
        const formattedDate = formatThaiDate(h.request_date);
        const formattedTime = h.request_time.slice(0, 5);

        let resClass = 'result-progress';
        if (h.test_result === 'Pass') resClass = 'result-pass';
        if (h.test_result === 'Fail') resClass = 'result-fail';
        if (h.test_result === 'Hold') resClass = 'result-hold';

        const statusBadge = h.status === 'Completed' ? 'completed' : 'pending';

        tr.innerHTML = `
          <td><strong>${h.request_no}/${h.request_year}</strong></td>
          <td>${formattedDate} ${formattedTime} น.</td>
          <td>${escapeHtml(h.product_name)}</td>
          <td>${h.rm_no ? `<code>${escapeHtml(h.rm_no)}</code>` : '<em style="color:var(--text-muted);">ว่าง</em>'}</td>
          <td><span class="badge ${resClass}">${h.test_result}</span></td>
          <td>${escapeHtml(h.requester_name)}</td>
          <td><span class="badge ${statusBadge}">${h.status}</span></td>
          <td>
            <a href="#" onclick="App.closeBatchTraceModal(); App.navigate('request-detail', {id: '${h.request_id}'}); return false;">ดูรายละเอียด &rarr;</a>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-danger); padding:20px;">ไม่สามารถดึงข้อมูลประวัติได้: ${e.message}</td></tr>`;
    }
  }

  function closeBatchTraceModal() {
    const modal = document.getElementById('modal-batch-trace');
    if (modal) modal.classList.remove('open');
  }

  // --- 6. USER ACCOUNT MANAGER (ADMIN ONLY) ---
  async function loadUsersManager() {
    const listBody = document.getElementById('users-list-tbody');
    listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">กำลังโหลดรายชื่อผู้ใช้งาน...</td></tr>`;

    try {
      const users = await window.DB.getUsers();
      listBody.innerHTML = '';

      if (users.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">ไม่มีผู้ใช้งานระบบในขณะนี้</td></tr>`;
        return;
      }

      users.forEach(u => {
        const tr = document.createElement('tr');
        
        let roleBadgeClass = 'badge result-progress'; // default
        let roleText = 'Requester';
        if (u.role === 'admin') {
          roleBadgeClass = 'badge result-fail'; // red
          roleText = 'Admin';
        } else if (u.role === 'lab') {
          roleBadgeClass = 'badge result-hold'; // amber
          roleText = 'Lab';
        }

        const createdDate = u.created_at ? formatThaiDate(u.created_at.split('T')[0]) : '-';

        // Check if user row is current user (to prevent self deletion)
        const isSelf = u.id === state.currentUser.id;

        tr.innerHTML = `
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.display_name)}</td>
          <td><span class="${roleBadgeClass}" style="text-transform:none;">${roleText}</span></td>
          <td>${createdDate}</td>
          <td style="text-align:center; display:flex; justify-content:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="App.openChangePasswordModal('${u.id}', '${escapeHtml(u.username)}')" style="padding:4px 8px;">
              เปลี่ยนรหัสผ่าน
            </button>
            <button class="btn btn-logout btn-sm" onclick="App.deleteUserAccount('${u.id}', '${escapeHtml(u.username)}')" style="padding:4px 8px; border-radius:var(--radius-sm); ${isSelf ? 'opacity:0.3; cursor:not-allowed;' : ''}" ${isSelf ? 'disabled' : ''}>
              ลบ
            </button>
          </td>
        `;
        listBody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      listBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-danger); padding:30px;">ไม่สามารถดึงรายชื่อผู้ใช้ได้: ${e.message}</td></tr>`;
    }
  }

  function openCreateUserModal() {
    const modal = document.getElementById('modal-create-user');
    if (modal) {
      document.getElementById('create-user-form').reset();
      modal.classList.add('open');
    }
  }

  function closeCreateUserModal() {
    const modal = document.getElementById('modal-create-user');
    if (modal) modal.classList.remove('open');
  }

  async function handleCreateUserSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('user-username').value.trim();
    const displayName = document.getElementById('user-display-name').value.trim();
    const department = document.getElementById('user-dept').value.trim();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;

    if (password.length < 6) {
      showToast('รหัสผ่านจำเป็นต้องมีความยาวไม่ต่ำกว่า 6 อักขระ', 'warning');
      return;
    }

    // Validate username characters
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      showToast('ชื่อผู้ใช้งานสามารถใช้ตัวอักษรภาษาอังกฤษ ตัวเลข และเครื่องหมาย _ เท่านั้น', 'warning');
      return;
    }

    const fullDisplayName = department ? `${displayName} (${department})` : displayName;

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึก...');
      await window.DB.createUser(username, password, fullDisplayName, role);
      showToast(`สร้างบัญชีผู้ใช้ ${username} สำเร็จแล้ว`, 'success');
      closeCreateUserModal();
      loadUsersManager();
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถสร้างบัญชีผู้ใช้งานได้: ' + err.message, 'error');
    } finally {
      showLoadingButton(e.submitter, false, 'สร้างผู้ใช้');
    }
  }

  function openChangePasswordModal(userId, username) {
    const modal = document.getElementById('modal-change-password');
    if (modal) {
      document.getElementById('change-password-form').reset();
      document.getElementById('change-pwd-userid').value = userId;
      document.getElementById('change-pwd-title').innerText = `เปลี่ยนรหัสผ่านสำหรับผู้ใช้: ${username}`;
      modal.classList.add('open');
    }
  }

  function closeChangePasswordModal() {
    const modal = document.getElementById('modal-change-password');
    if (modal) modal.classList.remove('open');
  }

  async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('change-pwd-userid').value;
    const newPassword = document.getElementById('change-pwd-new').value;

    if (newPassword.length < 6) {
      showToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 อักขระ', 'warning');
      return;
    }

    try {
      showLoadingButton(e.submitter, true, 'กำลังบันทึก...');
      await window.DB.updateUserPassword(userId, newPassword);
      showToast('เปลี่ยนรหัสผ่านเสร็จสิ้นแล้ว', 'success');
      closeChangePasswordModal();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + err.message, 'error');
    } finally {
      showLoadingButton(e.submitter, false, 'บันทึกรหัสผ่านใหม่');
    }
  }

  async function deleteUserAccount(userId, username) {
    if (confirm(`คุณแน่ใจหรือว่าต้องการลบบัญชีผู้ใช้ ${username} ใช่หรือไม่? รายการใบแจ้งตรวจสอบของผู้ใช้นี้จะไม่หายไป แต่ผู้ใช้นี้จะไม่สามารถเข้าระบบได้อีกต่อไป`)) {
      try {
        await window.DB.deleteUser(userId);
        showToast(`ลบบัญชีผู้ใช้ ${username} เรียบร้อยแล้ว`, 'success');
        loadUsersManager();
      } catch (e) {
        console.error(e);
        showToast('ไม่สามารถลบบัญชีผู้ใช้งานได้: ' + e.message, 'error');
      }
    }
  }

  // --- DATABASE CONNECTION CONFIG ---
  function openConfigModal() {
    const modal = document.getElementById('modal-config');
    if (!modal) return;
    
    // Load config state
    const config = window.AppConfig.load();
    document.getElementById('config-db-mode').value = config.dbMode;
    document.getElementById('config-sb-url').value = config.supabaseUrl || '';
    document.getElementById('config-sb-key').value = config.supabaseAnonKey || '';
    
    // Show/hide fields
    handleConfigModeChange();
    modal.classList.add('open');
  }

  function closeConfigModal() {
    const modal = document.getElementById('modal-config');
    if (modal) modal.classList.remove('open');
  }

  function handleConfigModeChange() {
    const mode = document.getElementById('config-db-mode').value;
    const fields = document.getElementById('supabase-config-fields');
    if (fields) {
      fields.style.display = mode === 'supabase' ? 'block' : 'none';
    }
  }

  function saveDatabaseConfig() {
    const mode = document.getElementById('config-db-mode').value;
    const url = document.getElementById('config-sb-url').value.trim();
    const key = document.getElementById('config-sb-key').value.trim();

    if (mode === 'supabase' && (!url || !key)) {
      showToast('กรุณากรอกข้อมูล Supabase URL และ Anon Key ให้ครบถ้วน', 'warning');
      return;
    }

    const config = {
      dbMode: mode,
      supabaseUrl: url,
      supabaseAnonKey: key
    };

    if (window.AppConfig.save(config)) {
      showToast('บันทึกการตั้งค่าการเชื่อมต่อสำเร็จแล้ว ระบบกำลังรีเฟรชฐานข้อมูล...', 'success');
      closeConfigModal();
      
      // Update badge status and logout active user sessions because DB provider has changed
      updateConnectionBadge();
      logout();
    } else {
      showToast('ไม่สามารถบันทึกการตั้งค่าลงเครื่องได้', 'error');
    }
  }

  // --- EXPORT TO EXCEL & CSV ---
  async function exportRequestsExcel() {
    if (state.currentUser.role !== 'admin') {
      showToast('เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ส่งออกข้อมูลได้', 'error');
      return;
    }

    try {
      showToast('กำลังจัดเตรียมข้อมูลสำหรับการส่งออก...', 'info');

      // 1. Fetch matching requests based on current filters
      const requests = await window.DB.getRequests(state.filters);
      if (requests.length === 0) {
        showToast('ไม่พบข้อมูลที่จะส่งออก', 'warning');
        return;
      }

      // 2. Fetch details for each request to compile its sub-items
      const flattenedData = [];

      for (let r of requests) {
        try {
          const detail = await window.DB.getRequestDetail(r.id);
          
          if (detail.items && detail.items.length > 0) {
            detail.items.forEach(item => {
              flattenedData.push({
                'เลขที่ใบแจ้ง (Request No)': `${detail.request_no}/${detail.request_year}`,
                'วันที่แจ้ง (Date)': detail.request_date,
                'เวลาที่แจ้ง (Time)': detail.request_time,
                'ชื่อลูกค้า (Customer)': detail.customer_name,
                'ผู้แจ้ง (Requester)': detail.requester_name,
                'ทะเบียนรถ (Car Plate)': detail.car_plate || '',
                'หมายเลขซีล (Seal No)': detail.seal_no || '',
                'หมายเลขตู้ (Container No)': detail.container_no || '',
                'หมายเหตุ (Notes)': detail.notes || '',
                'ความคิดเห็นห้องปฏิบัติการ (Lab Comments)': detail.lab_comments || '',
                'สถานะใบแจ้ง (Request Status)': detail.status,
                'ชื่อสินค้า (Product Name)': item.product_name,
                'Batch Number': item.batch_number,
                'Quantity (จำนวน)': item.quantity,
                'RM No.': item.rm_no || '',
                'ผลการทดสอบ (Test Result)': item.test_result
              });
            });
          } else {
            // Append parent details if request has no product items
            flattenedData.push({
              'เลขที่ใบแจ้ง (Request No)': `${detail.request_no}/${detail.request_year}`,
              'วันที่แจ้ง (Date)': detail.request_date,
              'เวลาที่แจ้ง (Time)': detail.request_time,
              'ชื่อลูกค้า (Customer)': detail.customer_name,
              'ผู้แจ้ง (Requester)': detail.requester_name,
              'ทะเบียนรถ (Car Plate)': detail.car_plate || '',
              'หมายเลขซีล (Seal No)': detail.seal_no || '',
              'หมายเลขตู้ (Container No)': detail.container_no || '',
              'หมายเหตุ (Notes)': detail.notes || '',
              'ความคิดเห็นห้องปฏิบัติการ (Lab Comments)': detail.lab_comments || '',
              'สถานะใบแจ้ง (Request Status)': detail.status,
              'ชื่อสินค้า (Product Name)': '',
              'Batch Number': '',
              'Quantity (จำนวน)': '',
              'RM No.': '',
              'ผลการทดสอบ (Test Result)': ''
            });
          }
        } catch (itemErr) {
          console.warn(`Failed to fetch items for request ${r.request_no}:`, itemErr);
        }
      }

      // 3. Export data logic
      // Check if SheetJS library is loaded successfully via CDN
      if (typeof XLSX !== 'undefined') {
        const worksheet = XLSX.utils.json_to_sheet(flattenedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Laboratory Requests');
        
        // Generate download name
        const timestamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `LRMS_Export_${timestamp}.xlsx`);
        showToast('ส่งออกไฟล์ Excel (.xlsx) สำเร็จแล้ว', 'success');
      } else {
        // Fallback to CSV generation if CDN fails or runs completely offline
        console.warn('XLSX library not loaded. Falling back to CSV export.');
        triggerCSVDownload(flattenedData);
      }

    } catch (e) {
      console.error('Export failed:', e);
      showToast('การส่งออกข้อมูลล้มเหลว: ' + e.message, 'error');
    }
  }

  function triggerCSVDownload(data) {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
      const values = headers.map(header => {
        const escaped = ('' + (row[header] || '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    });

    // Excel compatibility for Thai characters: prepend UTF-8 BOM (\uFEFF)
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `LRMS_Export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('ส่งออกไฟล์ CSV สำเร็จแล้ว (เนื่องจากระบบออฟไลน์)', 'success');
  }

  // --- HELPERS & COMPASSIONATE UI ELEMENTS ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Choose icons
    let icon = '';
    if (type === 'success') icon = '<span style="color:#10b981; font-weight:bold;">&check;</span>';
    else if (type === 'error') icon = '<span style="color:#ef4444; font-weight:bold;">&#x26A0;</span>';
    else if (type === 'warning') icon = '<span style="color:#f59e0b; font-weight:bold;">!</span>';
    else icon = '<span style="color:#0284c7; font-weight:bold;">i</span>';

    toast.innerHTML = `
      <div style="font-size:16px;">${icon}</div>
      <div style="line-height:1.3;">${message}</div>
    `;

    container.appendChild(toast);

    // Fade in
    setTimeout(() => toast.classList.add('show'), 50);

    // Fade out and remove
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function showLoadingButton(button, isLoading, text) {
    if (!button) return;
    if (isLoading) {
      button.disabled = true;
      button.style.opacity = '0.7';
      button.innerText = text;
    } else {
      button.disabled = false;
      button.style.opacity = '1';
      button.innerText = text;
    }
  }

  function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      
      const year = parseInt(parts[0]) + 543; // Convert AD to BE
      const monthNames = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      const month = monthNames[parseInt(parts[1]) - 1];
      const day = parseInt(parts[2]);

      return `${day} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  }

  function escapeHtml(unsafe) {
    if (unsafe === undefined || unsafe === null) return '';
    return unsafe.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Bind init to window load event
  window.addEventListener('DOMContentLoaded', init);

  // Expose module APIs
  return {
    navigate,
    toggleSidebar,
    handleLogin,
    logout,
    handleFilterSubmit,
    clearFilters,
    addFormItemRow,
    removeFormItemRow,
    handleRequestFormSubmit,
    editCurrentRequest,
    deleteCurrentRequest,
    handleHistoryFilter,
    clearHistoryFilters,
    traceBatch,
    closeBatchTraceModal,
    openCreateUserModal,
    closeCreateUserModal,
    handleCreateUserSubmit,
    openChangePasswordModal,
    closeChangePasswordModal,
    handleChangePasswordSubmit,
    deleteUserAccount,
    openConfigModal,
    closeConfigModal,
    saveDatabaseConfig,
    handleConfigModeChange,
    exportRequestsExcel,
    showToast
  };
})();
