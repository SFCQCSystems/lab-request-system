-- SUPABASE SETUP SCRIPT
-- Project: Laboratory Request Management System (ระบบจัดการใบแจ้งตรวจสอบห้องปฏิบัติการ)
-- Run this script in the Supabase SQL Editor (SQL Editor -> New Query -> Run)

-- =========================================================================
-- 1. CLEANUP (Optional - uncomment if you want to rebuild tables)
-- =========================================================================
-- DROP TRIGGER IF EXISTS trg_update_request_status ON public.request_items;
-- DROP FUNCTION IF EXISTS public.update_request_status();
-- DROP TRIGGER IF EXISTS trg_set_request_no ON public.requests;
-- DROP FUNCTION IF EXISTS public.set_request_no();
-- DROP TABLE IF EXISTS public.request_items;
-- DROP TABLE IF EXISTS public.requests;
-- DROP TABLE IF EXISTS public.profiles;

-- =========================================================================
-- 2. CREATE TABLES
-- =========================================================================

-- Profiles Table (Linked to auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'requester' CHECK (role IN ('requester', 'admin', 'lab')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Requests Table (General request info)
CREATE TABLE public.requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_no INT NOT NULL,
  request_year INT NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_time TIME NOT NULL DEFAULT CURRENT_TIME,
  customer_name TEXT NOT NULL,
  requester_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
  car_plate TEXT,
  seal_no TEXT,
  container_no TEXT,
  notes TEXT,
  lab_comments TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_request_no_year UNIQUE (request_no, request_year)
);

-- Request Items Table (Individual products to test)
CREATE TABLE public.request_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.requests(id) ON DELETE CASCADE NOT NULL,
  product_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  quantity TEXT NOT NULL,
  rm_no TEXT,
  test_result TEXT NOT NULL DEFAULT 'In Progress' CHECK (test_result IN ('In Progress', 'Pass', 'Fail', 'Hold')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================================
-- 3. TRIGGERS & FUNCTIONS
-- =========================================================================

-- Trigger to set request_no and request_year BEFORE INSERT
CREATE OR REPLACE FUNCTION public.set_request_no()
RETURNS TRIGGER AS $$
DECLARE
  v_current_year INT;
  v_next_no INT;
BEGIN
  -- Set request date if not provided
  IF NEW.request_date IS NULL THEN
    NEW.request_date := CURRENT_DATE;
  END IF;
  
  v_current_year := EXTRACT(YEAR FROM NEW.request_date);
  NEW.request_year := v_current_year;

  -- Generate request_no if not provided
  IF NEW.request_no IS NULL THEN
    SELECT COALESCE(MAX(request_no), 0) + 1
    INTO v_next_no
    FROM public.requests
    WHERE request_year = v_current_year;
    
    NEW.request_no := v_next_no;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_request_no
BEFORE INSERT ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.set_request_no();


-- Trigger to calculate request status AFTER INSERT/UPDATE/DELETE on request_items
CREATE OR REPLACE FUNCTION public.update_request_status()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_count INT;
  v_item_count INT;
  v_request_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_request_id := OLD.request_id;
  ELSE
    v_request_id := NEW.request_id;
  END IF;

  -- Count items making it pending:
  -- 1) RM No is null or empty
  -- 2) Test result is 'In Progress'
  SELECT 
    COUNT(CASE WHEN rm_no IS NULL OR TRIM(rm_no) = '' OR test_result IN ('In Progress', 'Hold') THEN 1 END),
    COUNT(id)
  INTO v_pending_count, v_item_count
  FROM public.request_items
  WHERE request_id = v_request_id;

  -- Status is Completed ONLY if there is at least one item, and zero pending items
  IF v_item_count > 0 AND v_pending_count = 0 THEN
    UPDATE public.requests SET status = 'Completed' WHERE id = v_request_id;
  ELSE
    UPDATE public.requests SET status = 'Pending' WHERE id = v_request_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_request_status
AFTER INSERT OR UPDATE OR DELETE ON public.request_items
FOR EACH ROW
EXECUTE FUNCTION public.update_request_status();


-- Trigger to create profile when auth.user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    SPLIT_PART(NEW.email, '@', 1),
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'requester')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Allow authenticated users to read profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admins to do everything on profiles"
ON public.profiles FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Requests Policies
CREATE POLICY "Admins can do everything on requests"
ON public.requests FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Allow authenticated users to read requests"
ON public.requests FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Requesters can create their own requests"
ON public.requests FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'requester')
);

CREATE POLICY "Lab can update requests"
ON public.requests FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'lab')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'lab')
);

-- Request Items Policies
CREATE POLICY "Admins can do everything on request_items"
ON public.request_items FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Allow authenticated users to read request_items"
ON public.request_items FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Requesters can insert items for their own requests"
ON public.request_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.requests WHERE requests.id = request_items.request_id AND requests.requester_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'requester')
);

CREATE POLICY "Lab can insert request_items"
ON public.request_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'lab')
);

CREATE POLICY "Lab can delete request_items"
ON public.request_items FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'lab')
);


-- =========================================================================
-- 5. ADMIN USER MANAGEMENT FUNCTIONS (SECURITY DEFINER)
-- =========================================================================

-- Function for Admin to reset user passwords
CREATE OR REPLACE FUNCTION public.admin_update_user_password(p_user_id UUID, p_new_password TEXT)
RETURNS VOID AS $$
BEGIN
  -- Confirm caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can update user passwords.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function for Admin to delete users
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Confirm caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can delete users.';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
