<script setup lang="ts"></script>

<template>
    <div
        id="title"
        class="glass glass-hover font-vt_323 flex flex-col gap-2 sm:gap-3 align-middle items-center justify-center mb-4 sm:mb-6 mx-auto max-w-full sm:max-w-xl rounded-2xl px-4 sm:px-8 py-5 sm:py-6"
    >
        <div class="flex items-center gap-2 sm:gap-3">
            <img src="/icon.png" alt="Web icon" class="size-8 sm:size-10 md:size-12" />
            <h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-none">/tmp/fup</h1>
        </div>
        <div class="text-left font-fira_code">
            <p class="text-xs sm:text-sm line-clamp-2">
                Temporary file upload.
                <br />
                Files automatically deleted after 1 hour.
            </p>
            <p class="text-xs sm:text-sm line-clamp-2">Maximum file size is 100 MiB (104,857,600 bytes).</p>
        </div>
    </div>
</template>

<style></style>
