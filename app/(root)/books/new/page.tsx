import UploadForm from '@/components/UploadForm';

const Page = () => {
  return (
    <main className='wrapper container'>
      <div className='mx-auto max-w-180 space-y-10'>
        <section className='flex flex-col gap-5 text-center'>
          <h1 className='page-title-xl'>Add a New Book</h1>
          <p className='subtitle'>
            Upload a PDF to generate your interactive reading experience
          </p>
        </section>

        <UploadForm />
      </div>
    </main>
  );
};

export default Page;
