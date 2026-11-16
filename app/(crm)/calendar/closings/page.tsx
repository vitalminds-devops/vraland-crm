import { PageContainer } from "@/components/common/page-container";
import { CalendarPageContent } from "@/features/calendar/components/calendar-page-content";
export default async function ClosingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  return (
    <PageContainer>
      <CalendarPageContent
        query={await searchParams}
        fixedType="closing"
        title="Closing deadlines"
        description="Upcoming closings."
      />
    </PageContainer>
  );
}
