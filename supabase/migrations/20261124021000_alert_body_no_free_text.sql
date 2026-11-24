-- Security review of 20261124020000: new-request alerts go to every admin,
-- manager and staff user regardless of section permissions (IMP-10), so the
-- body carries only metadata, never the customer's free-text message.
CREATE OR REPLACE FUNCTION public.alert_new_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE staff UUID[] := public.users_with_roles(ARRAY['admin', 'manager', 'staff']::public.app_role[]);
BEGIN
  IF TG_TABLE_NAME = 'rfqs' THEN
    PERFORM public.notify_users(staff, 'new_rfq',
      'New RFQ from ' || coalesce(NULLIF(NEW.company, ''), NEW.name),
      coalesce(NULLIF(concat_ws(' · ', NULLIF(NEW.product_type, ''), NULLIF(NEW.quantity, '') || ' pcs'), ''), 'Open RFQ Inbox for details'),
      '/admin/rfqs');
  ELSIF NEW.placed_by_client THEN
    PERFORM public.notify_users(staff, 'new_order',
      'New client order ' || NEW.order_number || coalesce(' from ' || NULLIF(NEW.party_name, ''), ''),
      NEW.quantity || ' pcs · open Orders for details',
      '/admin/orders');
  END IF;
  RETURN NULL;
END;
$$;
