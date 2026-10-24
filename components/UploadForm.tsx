'use client';

import { useAuth } from '@clerk/nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { upload } from '@vercel/blob/client';
import { Upload, ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
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
import VoiceSelector from '@/components/VoiceSelector';

import {
  checkBookExists,
  createBook,
  saveBookSegments,
} from '@/lib/actions/book.actions';
import { ACCEPTED_PDF_TYPES, ACCEPTED_IMAGE_TYPES } from '@/lib/constants';
import { generateSlug, parsePDFFile } from '@/lib/utils';
import { UploadSchema } from '@/lib/zod';
import type { BookUploadFormValues } from '@/types';

// Nothing to subscribe to: the value only differs between server and client
const emptySubscribe = () => () => {};

const UploadForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const onSubmit = async (data: BookUploadFormValues) => {
    if (!userId) {
      toast.error('Please login to upload books');
      return;
    }

    setIsSubmitting(true);

    // PostHog -> Track Book Uploads...

    try {
      const existsCheck = await checkBookExists(data.title);

      if (existsCheck.exists && existsCheck.book) {
        toast.info('Book with same title already exists.');
        form.reset();
        router.push(`/books/${existsCheck.book.slug}`);
        return;
      }

      // Safe blob name: no slashes or special characters; fallback for titles
      // with no Latin letters (the slug would otherwise be empty)
      const fileTitle = generateSlug(data.title) || 'book';
      const pdfFile = data.pdfFile;

      const parsedPDF = await parsePDFFile(pdfFile);

      if (parsedPDF.content.length === 0) {
        toast.error(
          'Failed to parse PDF. Please try again with a different file.'
        );
        return;
      }

      const uploadedPdfBlob = await upload(`${fileTitle}.pdf`, pdfFile, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: 'application/pdf',
      });

      let coverUrl: string;

      if (data.coverImage) {
        const coverFile = data.coverImage;
        const coverExt = coverFile.type.split('/')[1] || 'png';
        const uploadedCoverBlob = await upload(
          `${fileTitle}_cover.${coverExt}`,
          coverFile,
          {
            access: 'public',
            handleUploadUrl: '/api/upload',
            contentType: coverFile.type,
          }
        );
        coverUrl = uploadedCoverBlob.url;
      } else {
        const response = await fetch(parsedPDF.cover);
        const blob = await response.blob();

        const uploadedCoverBlob = await upload(`${fileTitle}_cover.png`, blob, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          contentType: 'image/png',
        });
        coverUrl = uploadedCoverBlob.url;
      }

      const book = await createBook({
        clerkId: userId,
        title: data.title,
        author: data.author,
        persona: data.persona,
        fileURL: uploadedPdfBlob.url,
        fileBlobKey: uploadedPdfBlob.pathname,
        coverURL: coverUrl,
        fileSize: pdfFile.size,
      });

      if (!book.success) {
        toast.error((book.error as string) || 'Failed to create book');
        if (book.isBillingError) {
          router.push('/subscriptions');
        }
        return;
      }

      if (book.alreadyExists) {
        toast.info('Book with same title already exists.');
        form.reset();
        router.push(`/books/${book.data.slug}`);
        return;
      }

      const segments = await saveBookSegments(
        book.data._id,
        userId,
        parsedPDF.content
      );

      if (!segments.success) {
        // TODO: delete the book created above (and its blobs) here, so a retry
        // doesn't find an existing book that has no segments.
        toast.error('Failed to save book segments');
        return;
      }

      form.reset();
      router.push('/');
    } catch (error) {
      console.error(error);

      toast.error('Failed to upload book. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) return null;

  return (
    <>
      {isSubmitting && <LoadingOverlay />}

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
