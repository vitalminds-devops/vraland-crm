import { PageContainer } from "@/components/common/page-container";
import { CalendarPageContent } from "@/features/calendar/components/calendar-page-content";
export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  return (
    <PageContainer>
      <CalendarPageContent
        query={await searchParams}
        fixedType="follow_up"
        title="Follow-up calendar"
        description="Scheduled calls and follow-ups."
      />
    </PageContainer>
  );
}
