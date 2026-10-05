-- Biblia: traducciones, libros y versiculos (fase 06). Contenido global.

-- CreateEnum
CREATE TYPE "testament" AS ENUM ('OLD', 'NEW');

-- CreateTable
CREATE TABLE "bible_translations" (
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "language" CHAR(2) NOT NULL,
    "version" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,

    CONSTRAINT "bible_translations_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "bible_books" (
    "translation_code" VARCHAR(20) NOT NULL,
    "id" VARCHAR(3) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "testament" "testament" NOT NULL,
    "chapter_count" SMALLINT NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "bible_books_pkey" PRIMARY KEY ("translation_code","id")
);

-- CreateTable
CREATE TABLE "bible_verses" (
    "translation_code" VARCHAR(20) NOT NULL,
    "book_id" VARCHAR(3) NOT NULL,
    "chapter" SMALLINT NOT NULL,
    "verse" SMALLINT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("translation_code","book_id","chapter","verse")
);

-- AddForeignKey
ALTER TABLE "bible_books" ADD CONSTRAINT "bible_books_translation_code_fkey" FOREIGN KEY ("translation_code") REFERENCES "bible_translations"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bible_verses" ADD CONSTRAINT "bible_verses_translation_code_book_id_fkey" FOREIGN KEY ("translation_code", "book_id") REFERENCES "bible_books"("translation_code", "id") ON DELETE CASCADE ON UPDATE CASCADE;

