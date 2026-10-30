import { PricingTable } from '@clerk/nextjs';

export default function SubscriptionsPage() {
  return (
    <div className='wrapper container py-10'>
      <div className='mb-10 flex flex-col items-center text-center'>
        <h1 className='mb-4 font-serif text-4xl font-bold'>Choose Your Plan</h1>
        <p className='max-w-2xl text-muted-foreground'>
          Upgrade to unlock more books, longer sessions, and advanced features.
        </p>
      </div>

      <div className='clerk-pricing-container'>
        <PricingTable />
      </div>
    </div>
  );
}
