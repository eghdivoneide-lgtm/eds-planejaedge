-- A-02 (auditoria): a policy de INSERT validava apenas a identidade, permitindo
-- que um cliente definisse 'creditos' arbitrario caso o trigger nao criasse o
-- perfil. Endurece a policy para limitar o saldo inicial no insert via cliente.
-- O trigger handle_new_user e SECURITY DEFINER (ignora RLS), entao continua
-- criando o perfil com 100 normalmente. Compras (kiwify_grant) sao UPDATE via
-- service_role, tambem nao afetadas.
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id AND creditos <= 100);
