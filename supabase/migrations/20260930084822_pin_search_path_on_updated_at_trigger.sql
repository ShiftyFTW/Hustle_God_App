/*
  # Pin the search_path on the timestamp trigger function

  public.update_updated_at_column was created without SET search_path, so
  unqualified names inside it resolve against whatever search_path is active
  at execution time. Pinning it removes that resolution ambiguity, which is
  the hardening Supabase's database linter asks for
  (function_search_path_mutable).

  1. Security
     - Fix the function's search_path to public, pg_temp

  The function body is unchanged, so all existing updated_at triggers keep
  behaving exactly as before.
*/

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
