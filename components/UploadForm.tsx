'use client';

import { useAuth } from '@clerk/nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { upload } from '@vercel/blob/client';
import { Upload, ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import FileUploader from '@/components/FileUploader';
import LoadingOverlay from '@/components/LoadingOverlay';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import UpgradeDialog from '@/components/UpgradeDialog';
import VoiceSelector from '@/components/VoiceSelector';

import {
  checkUploadEligibility,
  createBook,
  saveBookSegments,
  deleteIncompleteUpload,
  deleteOrphanedBlobs,
} from '@/lib/actions/book.actions';
import { ACCEPTED_PDF_TYPES, ACCEPTED_IMAGE_TYPES } from '@/lib/constants';
import { generateSlug, parsePDFFile } from '@/lib/utils';
import { UploadSchema } from '@/lib/zod';
import type { BookUploadFormValues } from '@/types';

// Nothing to subscribe to: the value only differs between server and client
const emptySubscribe = () => () => {};

const UploadForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Plan limit message: when set, the upgrade dialog is open
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  // Stays true after the dialog is dismissed, so the upgrade path stays visible
  const [isBillingError, setIsBillingError] = useState(false);
  // Slug of the book that already exists with the same title, if any
  const [existingSlug, setExistingSlug] = useState<string | null>(null);
  // false during server render and hydration, true once mounted on the client
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const { userId } = useAuth();
  const router = useRouter();

  const form = useForm<BookUploadFormValues>({
    resolver: zodResolver(UploadSchema),
    defaultValues: {
      title: '',
      author: '',
      persona: '',
      pdfFile: undefined,
      coverImage: undefined,
    },
  });

  // With cacheComponents the page state is preserved when the user leaves, so
  // reset the form and clear stale errors on leave (effect cleanups still run
  // when the page is hidden)
  useEffect(() => {
    return () => {
      form.reset();
      setFormError(null);
      setUpgradeMessage(null);
      setIsBillingError(false);
      setExistingSlug(null);
    };
  }, [form]);

  // Shows an error on the page and keeps the form as it is
  const showError = (message: string) => {
    setFormError(message);
    toast.error(message);
  };

  // Plan limit reached: open the upgrade dialog and keep a notice on the page
  const showUpgrade = (message: string) => {
    setUpgradeMessage(message);
    setIsBillingError(true);
  };

  // Keeps the form as it is, so the user can change the title or open the
  // existing book
  const showDuplicate = (slug: string) => {
    const msg = 'A book with a similar title already exists.';
    setFormError(msg);
    setExistingSlug(slug);
    toast.info(msg);
  };

  const onSubmit = async (data: BookUploadFormValues) => {
    if (!userId) {
      toast.error('Please login to upload books');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setUpgradeMessage(null);
    setIsBillingError(false);
    setExistingSlug(null);

    // What this upload has created so far, so a failure can undo exactly that
    const uploadedUrls: string[] = [];
    let createdBookId: string | null = null;

    // FALLBACK: runs whenever the upload fails after files were uploaded.
    // - a book record exists  -> remove the book, its segments and its files
    // - only files exist      -> remove the files
    const rollback = async () => {
      try {
        if (createdBookId) {
          await deleteIncompleteUpload(createdBookId);
        } else if (uploadedUrls.length > 0) {
          await deleteOrphanedBlobs(uploadedUrls);
        }
      } catch (e) {
        // Cleanup is best effort: never hide the original error because of it
        console.error('Rollback failed', e);
      }
    };

    // PostHog -> Track Book Uploads...

    try {
      // 1. CHECK ELIGIBILITY & LIMITS FIRST (Prevents orphaned blobs if limits are exceeded)
      const eligibility = await checkUploadEligibility(data.title);

      if (!eligibility.success) {
        const message = eligibility.error || 'Upload check failed.';
        if (eligibility.isBillingError) {
          showUpgrade(message);
        } else {
          showError(message);
        }
        return;
      }

      // Only block if the book is complete. A book with 0 segments is the
      // leftover of a failed upload, so let the flow below finish it.
      if (eligibility.exists && eligibility.book) {
        if (eligibility.book.totalSegments > 0) {
          showDuplicate(eligibility.book.slug);
          return;
        }

        // Leftover of an earlier failed upload (0 segments): remove it and
        // start again from scratch, so no old files are left behind
        await deleteIncompleteUpload(String(eligibility.book._id));
      }

      const pdfFile = data.pdfFile;
      const parsedPDF = await parsePDFFile(pdfFile);

      if (parsedPDF.content.length === 0) {
        showError(
          'Failed to parse PDF. Please try again with a different file.'
        );
        return;
      }

      // Safe blob name: no slashes or special characters in the title part.
      // Files go under "<userId>/", which the upload route requires.
      const fileTitle = generateSlug(data.title) || 'book';

      // 2. NOW UPLOAD TO VERCEL BLOB (Safe because checks passed)
      const uploadedPdfBlob = await upload(
        `${userId}/${fileTitle}.pdf`,
        pdfFile,
        {
          access: 'public',
          handleUploadUrl: '/api/upload',
          contentType: 'application/pdf',
        }
      );
      uploadedUrls.push(uploadedPdfBlob.url);

      let coverUrl: string;
      let coverBlobKey: string;

      if (data.coverImage) {
        const coverFile = data.coverImage;
        const coverExt = coverFile.type.split('/')[1] || 'png';
        const uploadedCoverBlob = await upload(
          `${userId}/${fileTitle}_cover.${coverExt}`,
          coverFile,
          {
            access: 'public',
            handleUploadUrl: '/api/upload',
            contentType: coverFile.type,
          }
        );
        uploadedUrls.push(uploadedCoverBlob.url);
        coverUrl = uploadedCoverBlob.url;
        coverBlobKey = uploadedCoverBlob.pathname;
      } else {
        const response = await fetch(parsedPDF.cover);
        const blob = await response.blob();

        const uploadedCoverBlob = await upload(
          `${userId}/${fileTitle}_cover.png`,
          blob,
          {
            access: 'public',
            handleUploadUrl: '/api/upload',
            contentType: 'image/png',
          }
        );
        uploadedUrls.push(uploadedCoverBlob.url);
        coverUrl = uploadedCoverBlob.url;
        coverBlobKey = uploadedCoverBlob.pathname;
      }

      // 3. CREATE BOOK IN MONGODB
      const book = await createBook({
        clerkId: userId,
        title: data.title,
        author: data.author,
        persona: data.persona,
        fileURL: uploadedPdfBlob.url,
        fileBlobKey: uploadedPdfBlob.pathname,
        coverURL: coverUrl,
        coverBlobKey,
        fileSize: pdfFile.size,
      });

      // Checking data too narrows its type for everything below
      if (!book.success || !book.data) {
        // The files uploaded above are not attached to any book: remove them
        await rollback();
        const message = book.error || 'Failed to create book';
        if (book.isBillingError) {
          showUpgrade(message);
        } else {
          showError(message);
        }
        return;
      }

      // The book already exists (for example two uploads of one title ran at
      // the same time)
      if (book.alreadyExists) {
        // The book appeared in the meantime, so the files uploaded above are
        // not attached to anything: remove them
        await rollback();

        if (book.data.totalSegments > 0) {
          showDuplicate(book.data.slug);
          return;
        }

        showError(
          'This book is still being processed. Please try again in a moment.'
        );
        return;
      }

      // From here on the book record exists, so a failure removes the record
      createdBookId = String(book.data._id);

      // 4. SAVE BOOK SEGMENTS
      const segments = await saveBookSegments(
        createdBookId,
        userId,
        parsedPDF.content
      );

      if (!segments.success) {
        // Removes the book created above, its segments and its files
        await rollback();
        showError('Failed to save book segments. Upload rolled back.');
        return;
      }

      form.reset();
      router.push('/');
    } catch (error) {
      // Any unexpected failure (network, upload, server action): undo, then report
      console.error(error);
      await rollback();
      showError('Failed to upload book. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) return null;

  return (
    <>
      {isSubmitting && <LoadingOverlay />}

      {/* UPGRADE DIALOG: shown when the plan's book limit is reached */}
      <UpgradeDialog
        message={upgradeMessage}
        onClose={() => setUpgradeMessage(null)}
      />

      <div className='new-book-wrapper'>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
            {/* 1. PDF File Upload */}
            <FileUploader
              control={form.control}
              name='pdfFile'
              label='Book PDF File'
              acceptTypes={ACCEPTED_PDF_TYPES}
              icon={Upload}
              placeholder='Click to upload PDF'
              hint='PDF file (max 50MB)'
              disabled={isSubmitting}
            />

            {/* 2. Cover Image Upload */}
            <FileUploader
              control={form.control}
              name='coverImage'
              label='Cover Image (Optional)'
              acceptTypes={ACCEPTED_IMAGE_TYPES}
              icon={ImageIcon}
              placeholder='Click to upload cover image'
              hint='Leave empty to auto-generate from PDF'
              disabled={isSubmitting}
            />

            {/* 3. Title Input */}
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='form-label'>Title</FormLabel>
                  <FormControl>
                    <Input
                      className='form-input'
                      placeholder='ex: Rich Dad Poor Dad'
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 4. Author Input */}
            <FormField
              control={form.control}
              name='author'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='form-label'>Author Name</FormLabel>
                  <FormControl>
                    <Input
                      className='form-input'
                      placeholder='ex: Robert Kiyosaki'
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 5. Voice Selector */}
            <FormField
              control={form.control}
              name='persona'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='form-label'>
                    Choose Assistant Voice
                  </FormLabel>
                  <FormControl>
                    <VoiceSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* INLINE ERROR BANNER */}
            {formError && (
              <div className='space-y-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600'>
                <p>{formError}</p>
                {existingSlug && (
                  <p>
                    <Link
                      href={`/books/${existingSlug}`}
                      className='font-medium underline'
                    >
                      View existing book
                    </Link>{' '}
                    or change the title and try again.
                  </p>
                )}
              </div>
            )}

            {/* PLAN LIMIT NOTICE: stays visible after the dialog is dismissed */}
            {isBillingError && (
              <div className='space-y-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600'>
                <p>You have reached your plan&apos;s book limit.</p>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='border-red-300 text-red-700 hover:bg-red-100'
                  onClick={() => router.push('/subscriptions')}
                >
                  Upgrade
                </Button>
              </div>
            )}

            {/* 6. Submit Button */}
            <Button type='submit' className='form-btn' disabled={isSubmitting}>
              Begin Synthesis
            </Button>
          </form>
        </Form>
      </div>
    </>
  );
};

export default UploadForm;
