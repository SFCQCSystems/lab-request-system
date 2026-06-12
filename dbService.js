// DATABASE SERVICE LAYER
// Implements dual-mode database access: Local Mock (localStorage) and Supabase client.

(function () {
  // --- HELPERS FOR LOCAL STORAGE DB ---
  const LOCAL_USERS_KEY = 'lrms_local_users';
  const LOCAL_REQUESTS_KEY = 'lrms_local_requests';
  const LOCAL_ITEMS_KEY = 'lrms_local_items';
  const LOCAL_SESSION_KEY = 'lrms_local_session';

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Pre-seeded database values
  const defaultUsers = [
    { id: 'u-admin-1', username: 'admin', password: 'admin1234', display_name: 'สมชาย แอดมิน (ฝ่ายควบคุมคุณภาพ)', role: 'admin', created_at: new Date('2026-01-01T08:00:00Z').toISOString() },
    { id: 'u-req-1', username: 'requester', password: 'req1234', display_name: 'วิชัย ผู้แจ้ง (ฝ่ายผลิต)', role: 'requester', created_at: new Date('2026-01-01T08:30:00Z').toISOString() },
    { id: 'u-req-2', username: 'requester2', password: 'req1234', display_name: 'อนันต์ ผู้แจ้ง2 (ฝ่ายคลังสินค้า)', role: 'requester', created_at: new Date('2026-01-02T09:00:00Z').toISOString() }
  ];

  const defaultRequests = [
    {
      id: 'r-1',
      request_no: 1,
      request_year: 2026,
      request_date: '2026-05-15',
      request_time: '09:30:00',
      customer_name: 'บริษัท ลูบริแคนท์ จำกัด',
      requester_id: 'u-req-1',
      car_plate: '1กข 1234 กรุงเทพฯ',
      seal_no: 'SL-009988',
      container_no: 'CONT-9922',
      notes: 'ตรวจสอบด่วน สำหรับงานด่วนลูกค้าในนิคม',
      lab_comments: 'ผลการทดสอบความหนืดและค่าดัชนีความหนืด (Viscosity Index) อยู่ในเกณฑ์มาตรฐานตามเอกสารแนบ',
      status: 'Completed',
      created_at: new Date('2026-05-15T09:30:00Z').toISOString()
    },
    {
      id: 'r-2',
      request_no: 2,
      request_year: 2026,
      request_date: '2026-06-01',
      request_time: '10:15:00',
      customer_name: 'โรงงานอุตสาหกรรมภาคใต้',
      requester_id: 'u-req-1',
      car_plate: '82-9988 ชลบุรี',
      seal_no: 'SL-009989',
      container_no: 'CONT-9923',
      notes: 'เก็บตัวอย่างจากรถบรรทุกหน้าโรงงานก่อนถ่ายน้ำมันเข้าถังพัก',
      lab_comments: 'จาระบีรายการที่ 2 กำลังตรวจสอบความสม่ำเสมอของเนื้อ (Consistency Test)',
      status: 'Pending',
      created_at: new Date('2026-06-01T10:15:00Z').toISOString()
    },
    {
      id: 'r-3',
      request_no: 3,
      request_year: 2026,
      request_date: '2026-06-04',
      request_time: '14:00:00',
      customer_name: 'บริษัท ซุปเปอร์เพาเวอร์ เทรดดิ้ง',
      requester_id: 'u-req-2',
      car_plate: '70-5544 ระยอง',
      seal_no: 'SL-009990',
      container_no: 'CONT-9924',
      notes: 'สินค้านำเข้า ตรวจสอบสิ่งเจือปนและตะกอนก้นถัง',
      lab_comments: 'ตรวจพบตะกอนปนเปื้อนเกินมาตรฐาน 0.05% ไม่อนุมัติให้ทำรายการรับสินค้า',
      status: 'Completed',
      created_at: new Date('2026-06-04T14:00:00Z').toISOString()
    }
  ];

  const defaultItems = [
    { id: 'i-1', request_id: 'r-1', product_name: 'Hydraulic Oil AW 68', batch_number: 'B-260510-1', quantity: '10 Drums', rm_no: 'RM-HYD-01', test_result: 'Pass', created_at: new Date('2026-05-15T09:31:00Z').toISOString() },
    { id: 'i-2', request_id: 'r-1', product_name: 'Engine Oil 10W-30', batch_number: 'B-260512-2', quantity: '20 Drums', rm_no: 'RM-ENG-02', test_result: 'Pass', created_at: new Date('2026-05-15T09:31:00Z').toISOString() },
    { id: 'i-3', request_id: 'r-2', product_name: 'Gear Oil EP 220', batch_number: 'B-260601-1', quantity: '5,000 Liters', rm_no: 'RM-GER-03', test_result: 'Pass', created_at: new Date('2026-06-01T10:16:00Z').toISOString() },
    { id: 'i-4', request_id: 'r-2', product_name: 'Grease EP 2', batch_number: 'B-260601-2', quantity: '50 Pails', rm_no: '', test_result: 'In Progress', created_at: new Date('2026-06-01T10:16:00Z').toISOString() },
    { id: 'i-5', request_id: 'r-3', product_name: 'Turbine Oil T 46', batch_number: 'B-260603-5', quantity: '4 Drums', rm_no: 'RM-TUR-04', test_result: 'Fail', created_at: new Date('2026-06-04T14:01:00Z').toISOString() }
  ];

  // --- INITIALIZE LOCAL STORAGE ---
  function initLocalStorage() {
    if (!localStorage.getItem(LOCAL_USERS_KEY)) {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(defaultUsers));
    }
    if (!localStorage.getItem(LOCAL_REQUESTS_KEY)) {
      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(defaultRequests));
    }
    if (!localStorage.getItem(LOCAL_ITEMS_KEY)) {
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(defaultItems));
    }
  }
  initLocalStorage();

  // --- LOCAL DATABASE SERVICE ---
  const LocalDBService = {
    async login(username, password) {
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (!user) {
        throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
      }
      const sessionUser = { id: user.id, username: user.username, display_name: user.display_name, role: user.role };
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionUser));
      return sessionUser;
    },

    async logout() {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    },

    async getCurrentUser() {
      const session = localStorage.getItem(LOCAL_SESSION_KEY);
      return session ? JSON.parse(session) : null;
    },

    async getRequests(filters = {}) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      let requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      let items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');
      let users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');



      // Populate Requester display name
      requests = requests.map(r => {
        const u = users.find(user => user.id === r.requester_id);
        return {
          ...r,
          requester_name: u ? u.display_name : 'ไม่ระบุ'
        };
      });

      // Filter Logic
      if (filters.requestNo) {
        requests = requests.filter(r => r.request_no.toString().includes(filters.requestNo));
      }
      if (filters.customerName) {
        requests = requests.filter(r => r.customer_name.toLowerCase().includes(filters.customerName.toLowerCase()));
      }
      if (filters.status) {
        requests = requests.filter(r => r.status === filters.status);
      }
      if (filters.startDate) {
        requests = requests.filter(r => r.request_date >= filters.startDate);
      }
      if (filters.endDate) {
        requests = requests.filter(r => r.request_date <= filters.endDate);
      }

      // Filter by items parameters (productName, batchNumber, rmNo)
      if (filters.productName || filters.batchNumber || filters.rmNo) {
        const matchingRequestIds = new Set(
          items.filter(item => {
            let matches = true;
            if (filters.productName && !item.product_name.toLowerCase().includes(filters.productName.toLowerCase())) {
              matches = false;
            }
            if (filters.batchNumber && !item.batch_number.toLowerCase().includes(filters.batchNumber.toLowerCase())) {
              matches = false;
            }
            if (filters.rmNo && (!item.rm_no || !item.rm_no.toLowerCase().includes(filters.rmNo.toLowerCase()))) {
              matches = false;
            }
            return matches;
          }).map(item => item.request_id)
        );
        requests = requests.filter(r => matchingRequestIds.has(r.id));
      }

      // Sort by Year & No descending (newest first)
      return requests.sort((a, b) => {
        if (b.request_year !== a.request_year) return b.request_year - a.request_year;
        return b.request_no - a.request_no;
      });
    },

    async getRequestDetail(id) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');

      const req = requests.find(r => r.id === id);
      if (!req) throw new Error('ไม่พบข้อมูลใบแจ้ง');

      // Security check
      // Security check removed to allow requesters to view all requests

      const reqItems = items.filter(item => item.request_id === id);
      const requester = users.find(u => u.id === req.requester_id);

      return {
        ...req,
        requester_name: requester ? requester.display_name : 'ไม่ระบุ',
        items: reqItems
      };
    },

    // Compute request status based on item rules
    _computeStatus(items) {
      if (items.length === 0) return 'Pending';
      const isPending = items.some(item => !item.rm_no || item.rm_no.trim() === '' || ['In Progress', 'Hold'].includes(item.test_result));
      return isPending ? 'Pending' : 'Completed';
    },

    async createRequest(requestData, itemsData) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      const requestId = generateUUID();
      const now = new Date();
      const localDate = now.toISOString().split('T')[0];
      const localTime = now.toTimeString().split(' ')[0];
      const currentYear = parseInt(localDate.split('-')[0]);

      // Auto numbering for local storage
      const sameYearReqs = requests.filter(r => r.request_year === currentYear);
      const nextNo = sameYearReqs.reduce((max, r) => r.request_no > max ? r.request_no : max, 0) + 1;

      // Status check
      const preparedItems = itemsData.map(item => ({
        id: generateUUID(),
        request_id: requestId,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Progress',
        created_at: now.toISOString()
      }));

      const status = this._computeStatus(preparedItems);

      const newRequest = {
        id: requestId,
        request_no: nextNo,
        request_year: currentYear,
        request_date: localDate,
        request_time: localTime,
        customer_name: requestData.customer_name,
        requester_id: currentUser.id,
        car_plate: requestData.car_plate || '',
        seal_no: requestData.seal_no || '',
        container_no: requestData.container_no || '',
        notes: requestData.notes || '',
        lab_comments: requestData.lab_comments || '',
        status: status,
        created_at: now.toISOString()
      };

      requests.push(newRequest);
      items.push(...preparedItems);

      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));

      return { ...newRequest, items: preparedItems };
    },

    async updateRequest(id, requestData, itemsData) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      const reqIndex = requests.findIndex(r => r.id === id);
      if (reqIndex === -1) throw new Error('ไม่พบข้อมูลใบแจ้ง');

      // Security check
      if (!['admin', 'lab'].includes(currentUser.role)) {
        throw new Error('เฉพาะผู้ดูแลระบบ (Admin) หรือเจ้าหน้าที่ห้องปฏิบัติการ (Lab) เท่านั้นที่สามารถแก้ไขข้อมูลได้');
      }

      // Update request details (Admin can change request_no and request_year too)
      const updatedReq = {
        ...requests[reqIndex],
        request_no: parseInt(requestData.request_no) || requests[reqIndex].request_no,
        request_year: parseInt(requestData.request_year) || requests[reqIndex].request_year,
        customer_name: requestData.customer_name,
        car_plate: requestData.car_plate,
        seal_no: requestData.seal_no,
        container_no: requestData.container_no,
        notes: requestData.notes,
        lab_comments: requestData.lab_comments,
        request_date: requestData.request_date || requests[reqIndex].request_date,
        request_time: requestData.request_time || requests[reqIndex].request_time
      };

      // Check duplicates of request_no + request_year (excluding current request ID)
      const isDuplicate = requests.some(r => r.id !== id && r.request_no === updatedReq.request_no && r.request_year === updatedReq.request_year);
      if (isDuplicate) {
        throw new Error(`เลขที่ใบแจ้ง ${updatedReq.request_no}/${updatedReq.request_year} มีการใช้งานในระบบแล้ว`);
      }

      // Overwrite items for this request: delete old, insert new
      const filteredItems = items.filter(item => item.request_id !== id);

      const preparedItems = itemsData.map(item => ({
        id: item.id || generateUUID(),
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Progress',
        created_at: item.created_at || new Date().toISOString()
      }));

      // Calculate status
      updatedReq.status = this._computeStatus(preparedItems);

      requests[reqIndex] = updatedReq;
      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(filteredItems.concat(preparedItems)));

      return { ...updatedReq, items: preparedItems };
    },

    async deleteRequest(id) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');
      if (currentUser.role !== 'admin') {
        throw new Error('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบข้อมูลได้');
      }

      let requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      let items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');

      requests = requests.filter(r => r.id !== id);
      items = items.filter(item => item.request_id !== id);

      localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(requests));
      localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items));
    },

    async getMaterialHistory(filters = {}) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');
      if (!['admin', 'lab'].includes(currentUser.role)) {
        throw new Error('คุณไม่มีสิทธิ์เข้าดูระบบประวัติวัตถุดิบย้อนหลัง');
      }

      const requests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || '[]');
      const items = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || '[]');
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');

      // Link items with parent request details
      let history = items.map(item => {
        const req = requests.find(r => r.id === item.request_id);
        const requester = req ? users.find(u => u.id === req.requester_id) : null;
        return {
          id: item.id,
          request_id: item.request_id,
          request_no: req ? req.request_no : null,
          request_year: req ? req.request_year : null,
          request_date: req ? req.request_date : '',
          request_time: req ? req.request_time : '',
          customer_name: req ? req.customer_name : '',
          status: req ? req.status : '',
          requester_name: requester ? requester.display_name : 'ไม่ระบุ',
          product_name: item.product_name,
          batch_number: item.batch_number,
          quantity: item.quantity,
          rm_no: item.rm_no,
          test_result: item.test_result
        };
      });

      // Filter by history-specific criteria
      if (filters.productName) {
        history = history.filter(h => h.product_name.toLowerCase().includes(filters.productName.toLowerCase()));
      }
      if (filters.batchNumber) {
        history = history.filter(h => h.batch_number.toLowerCase().includes(filters.batchNumber.toLowerCase()));
      }
      if (filters.rmNo) {
        history = history.filter(h => h.rm_no && h.rm_no.toLowerCase().includes(filters.rmNo.toLowerCase()));
      }
      if (filters.requestNo) {
        history = history.filter(h => h.request_no && h.request_no.toString().includes(filters.requestNo));
      }
      if (filters.testResult) {
        history = history.filter(h => h.test_result === filters.testResult);
      }
      if (filters.startDate) {
        history = history.filter(h => h.request_date >= filters.startDate);
      }
      if (filters.endDate) {
        history = history.filter(h => h.request_date <= filters.endDate);
      }

      // Sort by newest date, then request_no
      return history.sort((a, b) => {
        if (b.request_date !== a.request_date) return b.request_date.localeCompare(a.request_date);
        return (b.request_no || 0) - (a.request_no || 0);
      });
    },

    async getBatchHistory(batchNumber) {
      const history = await this.getMaterialHistory();
      return history.filter(h => h.batch_number.toLowerCase() === batchNumber.toLowerCase());
    },

    // User Manager functions
    async getUsers() {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');
      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      return users.map(u => ({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at }));
    },

    async createUser(username, password, displayName, role) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');

      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว');
      }

      const newUser = {
        id: 'u-' + generateUUID().slice(0, 8),
        username: username.trim(),
        password: password,
        display_name: displayName.trim(),
        role: role,
        created_at: new Date().toISOString()
      };

      users.push(newUser);
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
      return { id: newUser.id, username: newUser.username, display_name: newUser.display_name, role: newUser.role };
    },

    async updateUserPassword(userId, password) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');

      const users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex === -1) throw new Error('ไม่พบข้อมูลผู้ใช้งาน');

      users[userIndex].password = password;
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    },

    async deleteUser(userId) {
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') throw new Error('Unauthorized');
      if (userId === currentUser.id) {
        throw new Error('ไม่สามารถลบบัญชีผู้ใช้งานของตนเองได้');
      }

      let users = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
      users = users.filter(u => u.id !== userId);
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
    }
  };

  // --- SUPABASE DATABASE SERVICE ---
  let supabaseClient = null;

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    const config = window.AppConfig.load();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('กรุณากำหนด Supabase URL และ Anon Key ในหน้าการตั้งค่าก่อนเชื่อมต่อ');
    }
    // Initialize standard Supabase client loaded via CDN script
    if (typeof supabase !== 'undefined') {
      supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      return supabaseClient;
    }
    throw new Error('ไม่พบ Library Supabase (อาจเนื่องจากการเชื่อมต่ออินเทอร์เน็ตล้มเหลว)');
  }

  const SupabaseDBService = {
    // Session state mapped locally because standard RLS utilizes authenticated user tokens
    async login(username, password) {
      const client = getSupabaseClient();
      // Map username to factory virtual email
      const email = `${username.trim().toLowerCase()}@factory.local`;
      
      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        // If login failed, customize error message for user
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        }
        throw new Error(error.message);
      }

      // Fetch user profile info
      const { data: profile, error: profileErr } = await client
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileErr) {
        throw new Error('ไม่พบข้อมูลส่วนตัวของผู้ใช้งาน: ' + profileErr.message);
      }

      return {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        role: profile.role
      };
    },

    async logout() {
      const client = getSupabaseClient();
      await client.auth.signOut();
    },

    async getCurrentUser() {
      try {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session) return null;

        const { data: profile } = await client
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          return {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            role: profile.role
          };
        }
      } catch (e) {
        console.warn('Supabase not connected or initialized', e);
      }
      return null;
    },

    async getRequests(filters = {}) {
      const client = getSupabaseClient();
      
      // Starting base query
      let query = client
        .from('requests')
        .select(`
          *,
          profiles:requester_id (display_name)
        `);

      // Filters
      if (filters.requestNo) {
        query = query.ilike('request_no::text', `%${filters.requestNo}%`);
      }
      if (filters.customerName) {
        query = query.ilike('customer_name', `%${filters.customerName}%`);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.startDate) {
        query = query.gte('request_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('request_date', filters.endDate);
      }

      // Filters for sub-items
      if (filters.productName || filters.batchNumber || filters.rmNo) {
        // Query items first to fetch request_ids matching filters
        let itemQuery = client.from('request_items').select('request_id');
        if (filters.productName) {
          itemQuery = itemQuery.ilike('product_name', `%${filters.productName}%`);
        }
        if (filters.batchNumber) {
          itemQuery = itemQuery.ilike('batch_number', `%${filters.batchNumber}%`);
        }
        if (filters.rmNo) {
          itemQuery = itemQuery.ilike('rm_no', `%${filters.rmNo}%`);
        }

        const { data: matchedItems, error: itemErr } = await itemQuery;
        if (itemErr) throw new Error(itemErr.message);

        const ids = [...new Set(matchedItems.map(item => item.request_id))];
        if (ids.length === 0) return []; // Return empty if no matches
        query = query.in('id', ids);
      }

      const { data, error } = await query.order('request_year', { ascending: false }).order('request_no', { ascending: false });
      if (error) throw new Error(error.message);

      return data.map(r => ({
        ...r,
        requester_name: r.profiles ? r.profiles.display_name : 'ไม่ระบุ'
      }));
    },

    async getRequestDetail(id) {
      const client = getSupabaseClient();
      
      const { data: req, error: reqErr } = await client
        .from('requests')
        .select(`
          *,
          profiles:requester_id (display_name)
        `)
        .eq('id', id)
        .single();

      if (reqErr) throw new Error(reqErr.message);

      const { data: items, error: itemsErr } = await client
        .from('request_items')
        .select('*')
        .eq('request_id', id)
        .order('created_at', { ascending: true });

      if (itemsErr) throw new Error(itemsErr.message);

      return {
        ...req,
        requester_name: req.profiles ? req.profiles.display_name : 'ไม่ระบุ',
        items: items
      };
    },

    async createRequest(requestData, itemsData) {
      const client = getSupabaseClient();
      const currentUser = await this.getCurrentUser();
      if (!currentUser) throw new Error('Unauthenticated');

      // 1. Insert request metadata
      const { data: newReq, error: reqErr } = await client
        .from('requests')
        .insert({
          customer_name: requestData.customer_name,
          requester_id: currentUser.id,
          car_plate: requestData.car_plate || '',
          seal_no: requestData.seal_no || '',
          container_no: requestData.container_no || '',
          notes: requestData.notes || '',
          lab_comments: requestData.lab_comments || ''
          // request_no and request_year are set automatically by trigger
          // status is set automatically to Pending
        })
        .select()
        .single();

      if (reqErr) throw new Error(reqErr.message);

      // 2. Insert items linking to new request ID
      const itemsToInsert = itemsData.map(item => ({
        request_id: newReq.id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Progress'
      }));

      const { data: newItems, error: itemsErr } = await client
        .from('request_items')
        .insert(itemsToInsert)
        .select();

      if (itemsErr) {
        // Cleanup request if items insert fails (manual transaction control)
        await client.from('requests').delete().eq('id', newReq.id);
        throw new Error(itemsErr.message);
      }

      // Re-fetch detail to get populated fields and calculated status
      return this.getRequestDetail(newReq.id);
    },

    async updateRequest(id, requestData, itemsData) {
      const client = getSupabaseClient();

      // 1. Update request (including request_no and request_year for Admins)
      const { error: reqErr } = await client
        .from('requests')
        .update({
          request_no: parseInt(requestData.request_no),
          request_year: parseInt(requestData.request_year),
          customer_name: requestData.customer_name,
          car_plate: requestData.car_plate,
          seal_no: requestData.seal_no,
          container_no: requestData.container_no,
          notes: requestData.notes,
          lab_comments: requestData.lab_comments,
          request_date: requestData.request_date,
          request_time: requestData.request_time,
          status: requestData.status
        })
        .eq('id', id);

      if (reqErr) throw new Error(reqErr.message);

      // 2. Refresh items (Delete old ones and insert updated ones)
      const { error: delErr } = await client
        .from('request_items')
        .delete()
        .eq('request_id', id);

      if (delErr) throw new Error(delErr.message);

      const itemsToInsert = itemsData.map(item => ({
        request_id: id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        rm_no: item.rm_no || '',
        test_result: item.test_result || 'In Progress'
      }));

      const { error: insErr } = await client
        .from('request_items')
        .insert(itemsToInsert);

      if (insErr) throw new Error(insErr.message);

      // 3. Re-fetch details (will automatically show computed status from db trigger)
      return this.getRequestDetail(id);
    },

    async deleteRequest(id) {
      const client = getSupabaseClient();
      const { error } = await client
        .from('requests')
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
    },

    async getMaterialHistory(filters = {}) {
      const client = getSupabaseClient();

      let query = client
        .from('request_items')
        .select(`
          *,
          requests:request_id (
            request_no,
            request_year,
            request_date,
            request_time,
            customer_name,
            status,
            profiles:requester_id (display_name)
          )
        `);

      if (filters.productName) {
        query = query.ilike('product_name', `%${filters.productName}%`);
      }
      if (filters.batchNumber) {
        query = query.ilike('batch_number', `%${filters.batchNumber}%`);
      }
      if (filters.rmNo) {
        query = query.ilike('rm_no', `%${filters.rmNo}%`);
      }
      if (filters.testResult) {
        query = query.eq('test_result', filters.testResult);
      }

      // Filters targeting parent table
      if (filters.requestNo || filters.startDate || filters.endDate) {
        // Note: For complex cross-table filtering in Supabase without nested query limitations,
        // we can filter client side or construct filter criteria depending on parent fields.
        // Let's filter client-side or build nested strings. Standard client filtering on fetched rows
        // is reliable if the result list is manageable, or we query with inner joins.
        // In PostgREST, we can filter on parent fields like `requests.request_no=eq.value` but the row is omitted, 
        // which leaves records with null requests unless we query request first.
        // Let's query from requests instead if date filters are active, or filter post-fetch.
        // Post-fetch filtering is safest for complex relational searches in Supabase JS Client v2:
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Flatten and map
      let history = data.map(item => {
        const req = item.requests || {};
        const requester = req.profiles || {};
        return {
          id: item.id,
          request_id: item.request_id,
          request_no: req.request_no || null,
          request_year: req.request_year || null,
          request_date: req.request_date || '',
          request_time: req.request_time || '',
          customer_name: req.customer_name || '',
          status: req.status || '',
          requester_name: requester.display_name || 'ไม่ระบุ',
          product_name: item.product_name,
          batch_number: item.batch_number,
          quantity: item.quantity,
          rm_no: item.rm_no,
          test_result: item.test_result
        };
      });

      // Relational filters implemented on client for accuracy
      if (filters.requestNo) {
        history = history.filter(h => h.request_no && h.request_no.toString().includes(filters.requestNo));
      }
      if (filters.startDate) {
        history = history.filter(h => h.request_date >= filters.startDate);
      }
      if (filters.endDate) {
        history = history.filter(h => h.request_date <= filters.endDate);
      }

      return history.sort((a, b) => {
        if (b.request_date !== a.request_date) return b.request_date.localeCompare(a.request_date);
        return (b.request_no || 0) - (a.request_no || 0);
      });
    },

    async getBatchHistory(batchNumber) {
      return this.getMaterialHistory({ batchNumber: batchNumber });
    },

    async getUsers() {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    },

    async createUser(username, password, displayName, role) {
      const client = getSupabaseClient();
      const email = `${username.trim().toLowerCase()}@factory.local`;

      // Create a secondary non-persisted client to register the user without logging the current Admin out
      const config = window.AppConfig.load();
      const tempClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false }
      });

      const { data, error } = await tempClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            role: role,
            display_name: displayName
          }
        }
      });

      if (error) throw new Error(error.message);

      // Return a profile mockup since trigger will run to create the record
      return {
        id: data.user.id,
        username: username,
        display_name: displayName,
        role: role
      };
    },

    async updateUserPassword(userId, password) {
      const client = getSupabaseClient();
      // Invoke postgres security definer function created in schema setup
      const { error } = await client.rpc('admin_update_user_password', {
        p_user_id: userId,
        p_new_password: password
      });

      if (error) throw new Error(error.message);
    },

    async deleteUser(userId) {
      const client = getSupabaseClient();
      // Invoke postgres security definer function created in schema setup
      const { error } = await client.rpc('admin_delete_user', {
        p_user_id: userId
      });

      if (error) throw new Error(error.message);
    }
  };

  // --- EXPOSE CONSOLIDATED API ---
  window.DB = {
    // Always return SupabaseDBService since we only support Supabase Cloud now
    getService() {
      return SupabaseDBService;
    },

    // Bridge all functions dynamically
    async login(username, password) { return this.getService().login(username, password); },
    async logout() { return this.getService().logout(); },
    async getCurrentUser() { return this.getService().getCurrentUser(); },
    async getRequests(filters) { return this.getService().getRequests(filters); },
    async getRequestDetail(id) { return this.getService().getRequestDetail(id); },
    async createRequest(requestData, itemsData) { return this.getService().createRequest(requestData, itemsData); },
    async updateRequest(id, requestData, itemsData) { return this.getService().updateRequest(id, requestData, itemsData); },
    async deleteRequest(id) { return this.getService().deleteRequest(id); },
    async getMaterialHistory(filters) { return this.getService().getMaterialHistory(filters); },
    async getBatchHistory(batchNumber) { return this.getService().getBatchHistory(batchNumber); },
    async getUsers() { return this.getService().getUsers(); },
    async createUser(username, password, displayName, role) { return this.getService().createUser(username, password, displayName, role); },
    async updateUserPassword(userId, password) { return this.getService().updateUserPassword(userId, password); },
    async deleteUser(userId) { return this.getService().deleteUser(userId); }
  };
})();
