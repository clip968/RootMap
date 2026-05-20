-- Supabase Queues는 pgmq 확장 위에서 동작한다.
-- 문서 처리 job은 Vercel 함수 메모리가 아니라 Postgres queue에 남아야 재시도할 수 있다.
create extension if not exists pgmq;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues()
    where queue_name = 'document_processing'
  ) then
    perform pgmq.create('document_processing');
  end if;
end $$;
